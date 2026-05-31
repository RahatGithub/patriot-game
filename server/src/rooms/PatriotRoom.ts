import { Room, Client } from "colyseus";
import {
  MAX_PLAYERS_PER_ROOM,
  MIN_PLAYERS_TO_START,
  VALID_CHECKPOINT_COUNTS,
  TICK_INTERVAL_MS,
  PLAYER_RUN_SPEED,
  PLAYER_RADIUS,
  ClientMessage,
  ServerMessage,
  PATRIOT_MAP,
  WEAPONS,
} from "@patriot/shared";
import type { InputCommand, WeaponId } from "@patriot/shared";
import { RoomStateSchema } from "./schema/RoomStateSchema.js";
import { PlayerSchema } from "./schema/PlayerSchema.js";
import { BulletSchema } from "./schema/BulletSchema.js";
import { generateRoomCode } from "../utils/roomCode.js";
import { registerRoom, unregisterRoom } from "../utils/roomRegistry.js";
import { checkWallCollision, clampToMap } from "../systems/collision.js";

export class PatriotRoom extends Room<RoomStateSchema> {
  maxClients = MAX_PLAYERS_PER_ROOM;
  private playerInputs = new Map<string, InputCommand[]>();
  private bulletIdCounter = 0;

  onCreate(options: any) {
    const checkpointCount = VALID_CHECKPOINT_COUNTS.includes(options.checkpointCount)
      ? options.checkpointCount
      : 3;

    const code = generateRoomCode();

    this.setState(new RoomStateSchema());
    this.state.code = code;
    this.state.checkpointCount = checkpointCount;
    this.state.matchStarted = false;
    this.state.creatorId = "";

    registerRoom(code, this.roomId);

    // Simulation loop at 20Hz
    this.setSimulationInterval((dt) => this.tick(dt), TICK_INTERVAL_MS);

    // Input handler
    this.onMessage("input", (client, data: InputCommand) => {
      const buf = this.playerInputs.get(client.sessionId);
      if (buf) {
        // Cap buffer to prevent memory abuse
        if (buf.length < 30) {
          buf.push(data);
        }
      }
    });

    // Fire handler
    this.onMessage("fire", (client, data: { aimAngle: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.isDowned) return;

      const wep = WEAPONS[player.currentWeapon as WeaponId];
      if (!wep) return;

      const now = Date.now();
      const cooldown = 1000 / wep.fireRatePerSec;
      if (now - player.lastFireTimestamp < cooldown) return;

      // TODO: enforce ammo limits in Prompt 19 (treating as unlimited for v1.0)

      // Spawn bullet
      const spreadAngle = data.aimAngle + (Math.random() - 0.5) * wep.spread;
      const spawnDist = 35;
      const bx = player.x + Math.cos(data.aimAngle) * spawnDist;
      const by = player.y + Math.sin(data.aimAngle) * spawnDist;

      const bullet = new BulletSchema();
      bullet.id = `b${++this.bulletIdCounter}`;
      bullet.ownerId = client.sessionId;
      bullet.weaponId = player.currentWeapon;
      bullet.x = bx;
      bullet.y = by;
      bullet.vx = Math.cos(spreadAngle) * wep.bulletSpeed;
      bullet.vy = Math.sin(spreadAngle) * wep.bulletSpeed;
      bullet.spawnedAt = now;

      this.state.bullets.set(bullet.id, bullet);
      player.lastFireTimestamp = now;
    });

    // Ping handler
    this.onMessage("ping", (client, data: { t: number }) => {
      client.send("pong", { t: data.t });
    });

    // Start match handler
    this.onMessage(ClientMessage.START_MATCH, (client) => {
      if (client.sessionId !== this.state.creatorId) {
        client.send(ServerMessage.ERROR, { message: "Only the room creator can start the match" });
        return;
      }
      if (this.state.players.size < MIN_PLAYERS_TO_START) {
        client.send(ServerMessage.ERROR, {
          message: `Need at least ${MIN_PLAYERS_TO_START} players to start`,
        });
        return;
      }
      if (this.state.matchStarted) {
        client.send(ServerMessage.ERROR, { message: "Match already started" });
        return;
      }

      this.state.matchStarted = true;
      this.broadcast(ServerMessage.MATCH_STARTED);
      console.log(`[Room ${this.state.code}] Match started`);
    });

    console.log(`[Room] Created room ${code} with ${checkpointCount} checkpoints`);
  }

  private tick(deltaTime: number) {
    if (!this.state.matchStarted) return;

    this.state.players.forEach((player, sessionId) => {
      const inputs = this.playerInputs.get(sessionId);
      if (!inputs || inputs.length === 0) return;

      for (const input of inputs) {
        this.applyInput(player, input, deltaTime);
        player.lastProcessedInput = input.sequence;
      }
      inputs.length = 0;
    });

    // Simulate bullets
    const now = Date.now();
    const toRemove: string[] = [];
    this.state.bullets.forEach((bullet, id) => {
      bullet.x += bullet.vx * (deltaTime / 1000);
      bullet.y += bullet.vy * (deltaTime / 1000);

      const wep = WEAPONS[bullet.weaponId as WeaponId];
      if (now - bullet.spawnedAt > (wep?.bulletLifetimeMs ?? 1000)) {
        toRemove.push(id);
        return;
      }
      if (bullet.x < 0 || bullet.x > PATRIOT_MAP.width || bullet.y < 0 || bullet.y > PATRIOT_MAP.height) {
        toRemove.push(id);
        return;
      }
      if (checkWallCollision(bullet.x, bullet.y, wep?.bulletRadius ?? 4)) {
        toRemove.push(id);
        return;
      }
      // Player hit detection → Prompt 10
    });
    for (const id of toRemove) {
      this.state.bullets.delete(id);
    }
  }

  private applyInput(player: PlayerSchema, input: InputCommand, dt: number) {
    // Normalize & clamp input
    let mx = input.moveX;
    let my = input.moveY;
    const mag = Math.sqrt(mx * mx + my * my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }

    const step = PLAYER_RUN_SPEED * (dt / 1000);

    // Try X movement
    const newX = player.x + mx * step;
    if (!checkWallCollision(newX, player.y, PLAYER_RADIUS)) {
      player.x = newX;
    }

    // Try Y movement
    const newY = player.y + my * step;
    if (!checkWallCollision(player.x, newY, PLAYER_RADIUS)) {
      player.y = newY;
    }

    // Clamp to map bounds
    const clamped = clampToMap(player.x, player.y, PLAYER_RADIUS);
    player.x = clamped.x;
    player.y = clamped.y;

    // Aim
    player.aimAngle = input.aimAngle;
  }

  onAuth(client: Client, options: any): { name: string } {
    const playerName = (options.playerName || "").trim();

    if (!playerName || playerName.length > 20) {
      throw new Error("Invalid name: must be 1-20 characters");
    }
    if (!/^[a-zA-Z0-9 ]+$/.test(playerName)) {
      throw new Error("Invalid name: only letters, numbers, and spaces allowed");
    }

    let nameTaken = false;
    this.state.players.forEach((player) => {
      if (player.name.toLowerCase() === playerName.toLowerCase()) {
        nameTaken = true;
      }
    });
    if (nameTaken) {
      throw new Error("NAME_TAKEN");
    }

    if (this.state.players.size >= MAX_PLAYERS_PER_ROOM) {
      throw new Error("ROOM_FULL");
    }

    return { name: playerName };
  }

  onJoin(client: Client, options: any, auth: { name: string }) {
    const spawn = PATRIOT_MAP.playerSpawn;
    const player = new PlayerSchema();
    player.id = client.sessionId;
    player.name = auth.name;
    player.isCreator = this.state.players.size === 0;
    player.joinedAt = Date.now();
    player.x = spawn.x + Math.random() * spawn.width;
    player.y = spawn.y + Math.random() * spawn.height;
    player.hp = 100;
    player.rank = "soldier";

    if (player.isCreator) {
      this.state.creatorId = client.sessionId;
    }

    this.state.players.set(client.sessionId, player);
    this.playerInputs.set(client.sessionId, []);

    console.log(
      `[Room ${this.state.code}] Player joined: ${auth.name} (${client.sessionId})`
    );
  }

  async onLeave(client: Client, consented: boolean) {
    console.log(`[Room ${this.state.code}] Player left: ${client.sessionId}`);

    try {
      if (consented) throw new Error("consented");
      await this.allowReconnection(client, 10);
      console.log(`[Room ${this.state.code}] Player reconnected: ${client.sessionId}`);
      return;
    } catch {
      // Reconnection failed or consented leave
    }

    const wasCreator = client.sessionId === this.state.creatorId;
    this.state.players.delete(client.sessionId);
    this.playerInputs.delete(client.sessionId);
    console.log(`[Room ${this.state.code}] Player removed: ${client.sessionId}`);

    if (wasCreator && this.state.players.size > 0) {
      let oldest: PlayerSchema | null = null;
      let oldestKey = "";
      this.state.players.forEach((p, key) => {
        if (!oldest || p.joinedAt < oldest.joinedAt) {
          oldest = p;
          oldestKey = key;
        }
      });
      if (oldest) {
        oldest.isCreator = true;
        this.state.creatorId = oldestKey;
        console.log(
          `[Room ${this.state.code}] New creator: ${oldest.name} (${oldestKey})`
        );
      }
    }
  }

  onDispose() {
    unregisterRoom(this.state.code);
    console.log(`[Room ${this.state.code}] Disposed`);
  }
}
