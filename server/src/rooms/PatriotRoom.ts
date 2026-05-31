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
  getDamage,
  PLAYER_HITBOX_RADIUS,
  DOWNED_TIMEOUT_MS,
  AI_RADIUS,
  CHECKPOINT_CAPTURE_TIME_MS,
  MATCH_TIME_PER_CHECKPOINT_MS,
  CRATE_RADIUS,
  PICKUP_AUTO_RANGE,
  PICKUP_INTERACT_RANGE,
  PLAYER_MAX_HP,
  MAX_GRENADES,
  getRankForKills,
} from "@patriot/shared";
import type { InputCommand, WeaponId, DamageSource, MatchResult } from "@patriot/shared";
import { RoomStateSchema } from "./schema/RoomStateSchema.js";
import { PlayerSchema } from "./schema/PlayerSchema.js";
import { BulletSchema } from "./schema/BulletSchema.js";
import { generateRoomCode } from "../utils/roomCode.js";
import { registerRoom, unregisterRoom } from "../utils/roomRegistry.js";
import { checkWallCollision, clampToMap } from "../systems/collision.js";
import { AIManager } from "../ai/AIManager.js";
import { CheckpointSchema } from "./schema/CheckpointSchema.js";
import { CrateSchema } from "./schema/CrateSchema.js";
import { PickupSchema } from "./schema/PickupSchema.js";

export class PatriotRoom extends Room<RoomStateSchema> {
  maxClients = MAX_PLAYERS_PER_ROOM;
  private playerInputs = new Map<string, InputCommand[]>();
  private bulletIdCounter = 0;
  private allowFriendlyFire = process.env.ALLOW_FF === "1";
  private aiManager!: AIManager;

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

    this.aiManager = new AIManager(this.state);

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
      if (this.state.matchState !== "in_progress") return;
      const player = this.state.players.get(client.sessionId);
      if (!player || player.isDowned || player.isDead) return;

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
      player.shotsFired++;

      // Alert nearby AI via sound
      this.aiManager.broadcastSound(player.x, player.y);
    });

    // Debug weapon switch (dev only)
    this.onMessage("debugSetWeapon", (client, msg: { weaponId: string }) => {
      if (process.env.NODE_ENV === "production") return;
      const player = this.state.players.get(client.sessionId);
      if (player && WEAPONS[msg.weaponId as WeaponId]) {
        player.currentWeapon = msg.weaponId;
      }
    });

    // Interact handler (pickup items)
    this.onMessage("interact", (client) => {
      if (this.state.matchState !== "in_progress") return;
      const player = this.state.players.get(client.sessionId);
      if (!player || player.isDowned || player.isDead) return;

      let nearest: PickupSchema | null = null;
      let nearestDist = PICKUP_INTERACT_RANGE;
      let nearestId = "";
      this.state.pickups.forEach((pk, id) => {
        const d = Math.hypot(pk.x - player.x, pk.y - player.y);
        if (d < nearestDist) { nearest = pk; nearestDist = d; nearestId = id; }
      });
      if (nearest) {
        this.attemptPickup(player, nearest, nearestId);
      }
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
      this.state.matchState = "starting";
      this.broadcast(ServerMessage.MATCH_STARTED);

      // 2-second delay before match goes live
      this.clock.setTimeout(() => {
        this.startMatch();
      }, 2000);
    });

    console.log(`[Room] Created room ${code} with ${checkpointCount} checkpoints`);
  }

  private startMatch() {
    this.state.matchState = "in_progress";
    this.state.matchStartedAt = Date.now();
    const totalMs = this.state.checkpointCount * MATCH_TIME_PER_CHECKPOINT_MS;
    this.state.matchEndsAt = Date.now() + totalMs;
    this.state.timeRemainingMs = totalMs;

    this.initializeCheckpoints();
    this.initializeCrates();
    this.aiManager.spawnWave(1);

    console.log(`[Room ${this.state.code}] Match started (${totalMs / 1000}s)`);
  }

  private tick(deltaTime: number) {
    if (this.state.matchState !== "in_progress") return;

    // Update timer
    this.state.timeRemainingMs = Math.max(0, this.state.matchEndsAt - Date.now());

    // Check end conditions (precedence: wipe > timeout > win)
    if (this.allHumansDead()) {
      return this.endMatch("lose_wipe");
    }
    if (this.state.timeRemainingMs <= 0) {
      return this.endMatch("lose_timeout");
    }
    if (this.allCheckpointsCaptured()) {
      return this.endMatch("win");
    }

    this.state.players.forEach((player, sessionId) => {
      const inputs = this.playerInputs.get(sessionId);
      if (!inputs || inputs.length === 0) return;

      for (const input of inputs) {
        // Skip movement for downed/dead players
        if (!player.isDowned && !player.isDead) {
          this.applyInput(player, input, deltaTime);
        }
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
      // Player hit detection
      let hit = false;
      const isAIBullet = bullet.ownerId.startsWith("ai_");
      this.state.players.forEach((target, targetId) => {
        if (hit) return;
        if (targetId === bullet.ownerId) return;
        if (target.isDowned || target.isDead) return;
        // AI bullets damage humans; human bullets don't damage humans (friendly fire off)
        if (!isAIBullet && !this.allowFriendlyFire) return;

        const dx = bullet.x - target.x;
        const dy = bullet.y - target.y;
        const distSq = dx * dx + dy * dy;
        const r = PLAYER_HITBOX_RADIUS + (wep?.bulletRadius ?? 4);
        if (distSq < r * r) {
          this.applyDamageToPlayer(target, bullet, targetId);
          toRemove.push(id);
          hit = true;
        }
      });

      // AI hit detection (player bullets damage mafia)
      if (!hit && !bullet.ownerId.startsWith("ai_")) {
        this.state.ai.forEach((ai, aiId) => {
          if (hit) return;
          if (ai.isDead) return;
          const dx = bullet.x - ai.x;
          const dy = bullet.y - ai.y;
          const distSq = dx * dx + dy * dy;
          const r = AI_RADIUS + (wep?.bulletRadius ?? 4);
          if (distSq < r * r) {
            this.applyDamageToAI(ai, bullet, aiId);
            toRemove.push(id);
            hit = true;
          }
        });
      }

      // Crate hit detection (any bullet can damage crates)
      if (!hit) {
        this.state.crates.forEach((crate, crateId) => {
          if (hit || crate.destroyed) return;
          const dx = bullet.x - crate.x;
          const dy = bullet.y - crate.y;
          const r = CRATE_RADIUS + (wep?.bulletRadius ?? 4);
          if (dx * dx + dy * dy < r * r) {
            const dmg = wep ? getDamage(wep.damageSource, "crate") : 10;
            crate.hp = Math.max(0, crate.hp - dmg);
            this.broadcast("crateHit", { crateId, x: crate.x, y: crate.y });
            if (crate.hp <= 0) {
              this.destroyCrate(crate, crateId);
            }
            toRemove.push(id);
            hit = true;
          }
        });
      }
    });
    for (const id of toRemove) {
      this.state.bullets.delete(id);
    }

    // Downed → permadeath timer
    this.state.players.forEach((p, pid) => {
      if (p.isDowned && !p.isDead) {
        if (now - p.downedAt > DOWNED_TIMEOUT_MS) {
          p.isDead = true;
          p.deaths++;
          this.broadcast("playerDied", { victimId: pid });
        }
      }
    });

    // AI update
    this.aiManager.update(deltaTime);

    // Checkpoint capture logic
    this.state.checkpoints.forEach((cp) => {
      if (cp.captured) return;

      const humansInZone: PlayerSchema[] = [];
      this.state.players.forEach((p) => {
        if (p.isDead) return;
        const dx = p.x - cp.x;
        const dy = p.y - cp.y;
        if (dx * dx + dy * dy <= cp.radius * cp.radius) {
          humansInZone.push(p);
        }
      });

      let mafiaInZone = 0;
      this.state.ai.forEach((ai) => {
        if (ai.isDead) return;
        const dx = ai.x - cp.x;
        const dy = ai.y - cp.y;
        if (dx * dx + dy * dy <= cp.radius * cp.radius) mafiaInZone++;
      });

      cp.capturingPlayerIds = humansInZone.map((p) => p.id).join(",");

      if (humansInZone.length > 0 && mafiaInZone === 0) {
        cp.captureProgress += deltaTime / CHECKPOINT_CAPTURE_TIME_MS;
        if (cp.captureProgress >= 1.0) {
          cp.captureProgress = 1.0;
          cp.captured = true;
          cp.capturedAt = Date.now();
          this.state.capturedCount++;
          this.onCheckpointCaptured(cp);
        }
      } else if (humansInZone.length === 0) {
        // No humans — decay progress
        cp.captureProgress = Math.max(0, cp.captureProgress - deltaTime / 2000);
      }
      // If mafia in zone with humans: progress paused (no increment, no decay)
    });

    // Auto-pickup check
    const pickupsToRemove: string[] = [];
    this.state.pickups.forEach((pk, pkId) => {
      if (!this.isAutoPickupType(pk.type)) return;
      this.state.players.forEach((player) => {
        if (player.isDead || player.isDowned) return;
        if (Math.hypot(pk.x - player.x, pk.y - player.y) < PICKUP_AUTO_RANGE) {
          this.attemptPickup(player, pk, pkId);
          pickupsToRemove.push(pkId);
        }
      });
    });
    for (const id of pickupsToRemove) {
      this.state.pickups.delete(id);
    }
  }

  private initializeCheckpoints() {
    const count = this.state.checkpointCount;
    const activeCps = PATRIOT_MAP.checkpoints.slice(0, count);

    activeCps.forEach((cpDef, i) => {
      const cp = new CheckpointSchema();
      cp.id = cpDef.id;
      cp.order = i + 1;
      cp.x = cpDef.position.x;
      cp.y = cpDef.position.y;
      cp.radius = cpDef.radius;
      this.state.checkpoints.set(cp.id, cp);
    });

    console.log(`[Room ${this.state.code}] Initialized ${count} checkpoints`);
  }

  private initializeCrates() {
    PATRIOT_MAP.crates.forEach((def) => {
      const c = new CrateSchema();
      c.id = def.id;
      c.x = def.x;
      c.y = def.y;
      c.content = def.content;
      this.state.crates.set(c.id, c);
    });
    console.log(`[Room ${this.state.code}] Initialized ${PATRIOT_MAP.crates.length} crates`);
  }

  private destroyCrate(crate: CrateSchema, crateId: string) {
    crate.destroyed = true;
    this.broadcast("crateDestroyed", {
      crateId,
      x: crate.x,
      y: crate.y,
      content: crate.content,
    });

    // Spawn pickup first, then clean up crate after delay
    const pickup = new PickupSchema();
    pickup.id = "p_" + crateId;
    pickup.type = crate.content;
    pickup.x = crate.x;
    pickup.y = crate.y;
    pickup.spawnedAt = Date.now();
    this.state.pickups.set(pickup.id, pickup);

    this.clock.setTimeout(() => this.state.crates.delete(crateId), 1500);
  }

  private attemptPickup(player: PlayerSchema, pickup: PickupSchema, pickupId: string) {
    switch (pickup.type) {
      case "test":
        console.log(`[Room ${this.state.code}] ${player.name} picked up TEST pickup ${pickupId}`);
        this.state.pickups.delete(pickupId);
        break;
      case "cure":
        if (player.hp >= PLAYER_MAX_HP) return; // Don't waste — cure stays
        player.hp = PLAYER_MAX_HP;
        this.state.pickups.delete(pickupId);
        this.broadcast("cureUsed", { playerId: player.id, x: pickup.x, y: pickup.y });
        console.log(`[Room ${this.state.code}] ${player.name} picked up cure`);
        break;
      case "weapon_pistol":
      case "weapon_mk18":
      case "weapon_grenade":
      case "weapon_mg":
      case "weapon_bazooka": {
        const weaponId = pickup.type.replace("weapon_", "") as WeaponId;
        if (weaponId === "grenade") {
          if (player.grenadeCount >= MAX_GRENADES) return; // Full — grenade stays
          player.grenadeCount = Math.min(MAX_GRENADES, player.grenadeCount + 3);
        } else {
          player.currentWeapon = weaponId;
          const def = WEAPONS[weaponId];
          if (def.ammo !== "unlimited") player.ammo = def.ammo as number;
        }
        this.state.pickups.delete(pickupId);
        this.broadcast("weaponPicked", { playerId: player.id, weaponId });
        console.log(`[Room ${this.state.code}] ${player.name} picked up ${weaponId}`);
        break;
      }
      default:
        console.warn(`Unknown pickup type: ${pickup.type}`);
    }
  }

  private isAutoPickupType(type: string): boolean {
    return type === "cure";
  }

  private snapshotStats() {
    const players: any[] = [];
    this.state.players.forEach((p) => {
      players.push({
        name: p.name,
        rank: p.rank,
        kills: p.kills,
        deaths: p.deaths,
        damageDealt: p.damageDealt,
        checkpointsCaptured: p.checkpointsCaptured,
      });
    });
    return {
      capturedSoFar: this.state.capturedCount,
      totalCheckpoints: this.state.checkpointCount,
      timeRemainingMs: this.state.timeRemainingMs,
      players,
    };
  }

  private snapshotFullStats() {
    const players: any[] = [];
    this.state.players.forEach((p) => {
      players.push({
        id: p.id,
        name: p.name,
        isCreator: p.isCreator,
        rank: p.rank,
        kills: p.kills,
        deaths: p.deaths,
        damageDealt: p.damageDealt,
        damageTaken: p.damageTaken,
        shotsFired: p.shotsFired,
        shotsHit: p.shotsHit,
        checkpointsCaptured: p.checkpointsCaptured,
        revives: p.revives,
      });
    });

    return {
      result: this.state.matchResult,
      matchDurationMs: Date.now() - this.state.matchStartedAt,
      capturedCount: this.state.capturedCount,
      totalCheckpoints: this.state.checkpointCount,
      totalAISpawned: this.state.totalAISpawned,
      totalAIKilled: this.state.totalAIKilled,
      players: players.sort((a, b) => b.kills - a.kills || b.damageDealt - a.damageDealt),
    };
  }

  private onCheckpointCaptured(cp: CheckpointSchema) {
    // Track checkpointsCaptured for players who were in the zone
    const capIds = cp.capturingPlayerIds.split(",").filter(Boolean);
    for (const pid of capIds) {
      const p = this.state.players.get(pid);
      if (p) p.checkpointsCaptured++;
    }

    this.broadcast("checkpointCaptured", {
      checkpointId: cp.id,
      order: cp.order,
      capturedAt: cp.capturedAt,
      stats: this.snapshotStats(),
    });

    // Respawn fully-dead players at this checkpoint
    this.state.players.forEach((p) => {
      if (p.isDead) {
        p.isDead = false;
        p.isDowned = false;
        p.hp = 100;
        p.x = cp.x + (Math.random() - 0.5) * 50;
        p.y = cp.y + (Math.random() - 0.5) * 50;
        p.currentWeapon = "pistol";
      }
    });

    // Spawn next wave
    this.aiManager.spawnWave(cp.order + 1);

    console.log(`[Room ${this.state.code}] Checkpoint ${cp.order} captured`);
  }

  private endMatch(result: NonNullable<MatchResult>) {
    this.state.matchState = "ended";
    this.state.matchResult = result;
    this.broadcast("MATCH_ENDED", {
      result,
      timeRemainingMs: this.state.timeRemainingMs,
      finalStats: this.snapshotFullStats(),
    });

    // Stop AI
    this.state.ai.forEach((ai) => {
      ai.behaviorState = "patrol";
    });

    console.log(`[Room ${this.state.code}] Match ended: ${result}`);
  }

  private allCheckpointsCaptured(): boolean {
    let allCaptured = true;
    this.state.checkpoints.forEach((cp) => {
      if (!cp.captured) allCaptured = false;
    });
    return allCaptured;
  }

  private allHumansDead(): boolean {
    if (this.state.players.size === 0) return false;
    let anyAliveOrDowned = false;
    this.state.players.forEach((p) => {
      if (!p.isDead) anyAliveOrDowned = true;
    });
    return !anyAliveOrDowned;
  }

  private applyDamageToAI(
    ai: import("./schema/AISchema.js").AISchema,
    bullet: { ownerId: string; weaponId: string },
    aiId: string
  ) {
    if (ai.isDead) return;
    const wep = WEAPONS[bullet.weaponId as WeaponId];
    const dmg = wep ? getDamage(wep.damageSource, "player") : 5;
    ai.hp = Math.max(0, ai.hp - dmg);

    const attacker = this.state.players.get(bullet.ownerId);
    if (attacker) {
      attacker.shotsHit++;
      attacker.damageDealt += dmg;
    }

    this.broadcast("damage", {
      targetId: aiId,
      attackerId: bullet.ownerId,
      amount: dmg,
      x: ai.x,
      y: ai.y,
      source: wep?.damageSource ?? "pistol_bullet",
    });

    if (ai.hp <= 0) {
      ai.isDead = true;
      ai.behaviorState = "dead";
      ai.deathTime = Date.now();
      this.state.totalAIKilled++;
      this.broadcast("aiKilled", { aiId, killerId: bullet.ownerId, x: ai.x, y: ai.y });
      const killer = this.state.players.get(bullet.ownerId);
      if (killer) {
        killer.kills++;
        this.checkPromotion(killer, bullet.ownerId);
      }
      console.log(`[Room ${this.state.code}] Mafia killed by ${killer?.name || bullet.ownerId}`);
    }
  }

  private applyDamageToPlayer(
    target: PlayerSchema,
    bullet: { ownerId: string; weaponId: string; x: number; y: number },
    targetId: string
  ) {
    if (target.isDowned || target.isDead) return;

    const wep = WEAPONS[bullet.weaponId as WeaponId];
    const dmg = wep ? getDamage(wep.damageSource, "player") : 5;
    target.hp = Math.max(0, target.hp - dmg);
    target.damageTaken += dmg;

    this.broadcast("damage", {
      targetId,
      attackerId: bullet.ownerId,
      amount: dmg,
      x: target.x,
      y: target.y,
      source: wep?.damageSource ?? "pistol_bullet",
    });

    if (target.hp <= 0) {
      target.isDowned = true;
      target.hp = 0;
      target.downedAt = Date.now();
      target.downedBy = bullet.ownerId;

      const killer = this.state.players.get(bullet.ownerId);
      if (killer) {
        killer.kills++;
        this.checkPromotion(killer, bullet.ownerId);
      }

      this.broadcast("playerDowned", {
        victimId: targetId,
        killerId: bullet.ownerId,
      });
    }
  }

  private checkPromotion(player: PlayerSchema, sessionId: string) {
    const newRankDef = getRankForKills(player.kills);
    if (newRankDef.id !== player.rank) {
      player.rank = newRankDef.id;
      this.broadcast("playerPromoted", {
        playerId: sessionId,
        newRankId: newRankDef.id,
        newRankName: newRankDef.name,
        kills: player.kills,
      });
      console.log(`[Room ${this.state.code}] ${player.name} promoted to ${newRankDef.name}`);
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
    if (this.state.matchState === "ended") {
      throw new Error("This match has ended. Ask for a new room code.");
    }

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
    let spawnX = spawn.x + Math.random() * spawn.width;
    let spawnY = spawn.y + Math.random() * spawn.height;

    // Mid-match join: spawn at latest captured checkpoint
    if (this.state.capturedCount > 0) {
      const captured = Array.from(this.state.checkpoints.values())
        .filter((c) => c.captured)
        .sort((a, b) => b.order - a.order);
      if (captured.length > 0) {
        spawnX = captured[0].x + (Math.random() - 0.5) * 50;
        spawnY = captured[0].y + (Math.random() - 0.5) * 50;
      }
    }

    const player = new PlayerSchema();
    player.id = client.sessionId;
    player.name = auth.name;
    player.isCreator = this.state.players.size === 0;
    player.joinedAt = Date.now();
    player.x = spawnX;
    player.y = spawnY;
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
