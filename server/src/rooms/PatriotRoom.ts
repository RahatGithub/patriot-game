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
  canUseWeapon,
  getRankRequiredForWeapon,
  REVIVE_RANGE,
  REVIVE_DURATION_MS,
  REVIVE_RESULT_HP,
  BARREL_HITBOX_RADIUS,
  BARREL_EXPLOSION_RADIUS,
  BARREL_PICKUP_RANGE,
  BARREL_CARRY_SPEED_MULT,
  BARREL_CARRY_OFFSET_Y,
  GRENADE_AOE_RADIUS,
  GRENADE_COOLDOWN_MS,
  BAZOOKA_AOE_RADIUS,
  VEHICLE_INTERACT_RANGE,
  JEEP_HP,
  JEEP_SPEED,
  JEEP_ROTATION_SPEED,
  JEEP_RADIUS,
  TRUCK_HP,
  TRUCK_SPEED,
  TRUCK_ROTATION_SPEED,
  TRUCK_CAPACITY,
  TRUCK_RADIUS,
  TANK_HP,
  TANK_SPEED,
  TANK_ROTATION_SPEED,
  TANK_RADIUS,
  TANK_CANNON_AOE_RADIUS,
} from "@patriot/shared";
import type { RankId } from "@patriot/shared";
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
import { BarrelSchema } from "./schema/BarrelSchema.js";
import { VehicleSchema } from "./schema/VehicleSchema.js";
import { applyAoE } from "../systems/aoe.js";
import type { AoEParams } from "../systems/aoe.js";
import type { DamageTarget } from "@patriot/shared";

export class PatriotRoom extends Room<RoomStateSchema> {
  maxClients = MAX_PLAYERS_PER_ROOM;
  private playerInputs = new Map<string, InputCommand[]>();
  private bulletIdCounter = 0;
  private allowFriendlyFire = process.env.ALLOW_FF === "1";
  private aiManager!: AIManager;
  private revivingMap = new Map<string, number>();

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

      // Ammo enforcement for limited-ammo weapons (bazooka)
      if (wep.ammo !== "unlimited" && player.ammo <= 0) return;
      if (wep.ammo !== "unlimited") player.ammo--;

      // Spawn bullet (use vehicle position if driving)
      const spreadAngle = data.aimAngle + (Math.random() - 0.5) * wep.spread;
      const spawnDist = 35;
      const originX = player.inVehicleId ? (this.state.vehicles.get(player.inVehicleId)?.x ?? player.x) : player.x;
      const originY = player.inVehicleId ? (this.state.vehicles.get(player.inVehicleId)?.y ?? player.y) : player.y;
      const bx = originX + Math.cos(data.aimAngle) * spawnDist;
      const by = originY + Math.sin(data.aimAngle) * spawnDist;

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

    // Interact handler — priority: 1. Revive  2. Barrel carry/drop  3. Loot pickup
    this.onMessage("interact", (client) => {
      if (this.state.matchState !== "in_progress") return;
      const player = this.state.players.get(client.sessionId);
      if (!player || player.isDowned || player.isDead) return;

      // 1. Check for downed teammate to revive
      let nearestDowned: PlayerSchema | null = null;
      let nearestDownedDist = REVIVE_RANGE;
      this.state.players.forEach((p) => {
        if (!p.isDowned || p.isDead || p.id === player.id) return;
        const d = Math.hypot(p.x - player.x, p.y - player.y);
        if (d < nearestDownedDist) { nearestDowned = p; nearestDownedDist = d; }
      });
      if (nearestDowned) return; // Revive handled by interactHeld flow

      // 2. Drop carried barrel (if any)
      if (player.carriedBarrelId) {
        this.dropBarrel(player, client.sessionId);
        return;
      }

      // 3. Pick up nearby barrel
      let nearestBarrel: BarrelSchema | null = null;
      let nearestBarrelId = "";
      let nearestBarrelDist = BARREL_PICKUP_RANGE;
      this.state.barrels.forEach((b, bId) => {
        if (b.exploded || b.carriedBy) return;
        const d = Math.hypot(b.x - player.x, b.y - player.y);
        if (d < nearestBarrelDist) { nearestBarrel = b; nearestBarrelId = bId; nearestBarrelDist = d; }
      });
      if (nearestBarrel) {
        this.pickupBarrel(player, client.sessionId, nearestBarrel);
        return;
      }

      // 4. Vehicle exit (if in one) or enter (if nearby)
      if (player.inVehicleId) {
        this.exitVehicle(player, client.sessionId);
        return;
      }
      let nearestVehicle: VehicleSchema | null = null;
      let nearestVehicleDist = VEHICLE_INTERACT_RANGE;
      this.state.vehicles.forEach((v) => {
        if (v.destroyed) return;
        const d = Math.hypot(v.x - player.x, v.y - player.y);
        if (d < nearestVehicleDist) { nearestVehicle = v; nearestVehicleDist = d; }
      });
      if (nearestVehicle) {
        this.enterVehicle(player, client.sessionId, nearestVehicle);
        return;
      }

      // 5. Try loot pickup
      let nearest: PickupSchema | null = null;
      let nearestDist = PICKUP_INTERACT_RANGE;
      let nearestId = "";
      this.state.pickups.forEach((pk, id) => {
        const d = Math.hypot(pk.x - player.x, pk.y - player.y);
        if (d < nearestDist) { nearest = pk; nearestDist = d; nearestId = id; }
      });
      if (nearest) {
        this.attemptPickup(player, nearest, nearestId, client);
      }
    });

    // Revive: continuous hold tracking
    this.onMessage("interactHeld", (client) => {
      if (this.state.matchState !== "in_progress") return;
      const player = this.state.players.get(client.sessionId);
      if (!player || player.isDowned || player.isDead) return;
      this.revivingMap.set(client.sessionId, Date.now());
    });

    this.onMessage("interactRelease", (client) => {
      this.revivingMap.delete(client.sessionId);
    });

    // Grenade throw handler
    this.onMessage("throwGrenade", (client) => {
      if (this.state.matchState !== "in_progress") return;
      const player = this.state.players.get(client.sessionId);
      if (!player || player.isDowned || player.isDead) return;
      if (player.grenadeCount <= 0) return;
      if (!canUseWeapon(player.rank as RankId, "grenade")) return;

      const now = Date.now();
      if (now - player.lastGrenadeAt < GRENADE_COOLDOWN_MS) return;

      player.grenadeCount--;
      player.lastGrenadeAt = now;
      this.spawnGrenade(player, client.sessionId);
    });

    // Drop weapon handler (F key) — revert to pistol
    this.onMessage("dropWeapon", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.isDowned || player.isDead) return;
      if (player.currentWeapon === "pistol") return;
      player.currentWeapon = "pistol";
      player.ammo = 30;
      this.broadcast("weaponDropped", { playerId: player.id });
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
    this.initializeBarrels();
    this.initializeVehicles();
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

    // Update carried barrel positions
    this.state.barrels.forEach((b) => {
      if (b.carriedBy) {
        const carrier = this.state.players.get(b.carriedBy);
        if (carrier && !carrier.isDead) {
          b.x = carrier.x;
          b.y = carrier.y + BARREL_CARRY_OFFSET_Y / 2;
        } else {
          // Carrier disconnected or dead — drop barrel
          b.carriedBy = "";
        }
      }
    });

    // Simulate bullets
    const now = Date.now();
    const toRemove: string[] = [];
    this.state.bullets.forEach((bullet, id) => {
      bullet.x += bullet.vx * (deltaTime / 1000);
      bullet.y += bullet.vy * (deltaTime / 1000);

      const wep = WEAPONS[bullet.weaponId as WeaponId];
      const isGrenade = bullet.weaponId === "grenade";
      const isRocket = bullet.weaponId === "bazooka" || bullet.weaponId === "tank_cannon";
      const expired = now - bullet.spawnedAt > (wep?.bulletLifetimeMs ?? 1000);
      const oob = bullet.x < 0 || bullet.x > PATRIOT_MAP.width || bullet.y < 0 || bullet.y > PATRIOT_MAP.height;
      const hitWall = checkWallCollision(bullet.x, bullet.y, wep?.bulletRadius ?? 4);

      // Grenades detonate on wall hit, OOB, or fuse expiry — no direct-hit damage
      if (isGrenade) {
        if (expired || hitWall || oob) {
          this.detonateGrenade(bullet);
          toRemove.push(id);
        }
        return;
      }

      // Rockets detonate on wall/OOB/expiry OR on first entity impact
      if (isRocket) {
        if (hitWall || expired || oob) {
          this.detonateRocket(bullet);
          toRemove.push(id);
          return;
        }

        let rocketHit = false;
        const rocketR = WEAPONS.bazooka.bulletRadius;

        // Check player impact
        this.state.players.forEach((p) => {
          if (rocketHit || p.isDead || p.isDowned) return;
          if (p.id === bullet.ownerId) return;
          const dx = bullet.x - p.x, dy = bullet.y - p.y;
          if (dx * dx + dy * dy < (PLAYER_HITBOX_RADIUS + rocketR) ** 2) rocketHit = true;
        });

        // Check AI impact
        if (!rocketHit) {
          this.state.ai.forEach((ai) => {
            if (rocketHit || ai.isDead) return;
            const dx = bullet.x - ai.x, dy = bullet.y - ai.y;
            if (dx * dx + dy * dy < (AI_RADIUS + rocketR) ** 2) rocketHit = true;
          });
        }

        // Check barrel impact
        if (!rocketHit) {
          this.state.barrels.forEach((b) => {
            if (rocketHit || b.exploded) return;
            const dx = bullet.x - b.x, dy = bullet.y - b.y;
            if (dx * dx + dy * dy < (BARREL_HITBOX_RADIUS + rocketR) ** 2) rocketHit = true;
          });
        }

        if (rocketHit) {
          this.detonateRocket(bullet);
          toRemove.push(id);
        }
        return;
      }

      if (expired) {
        toRemove.push(id);
        return;
      }
      if (oob) {
        toRemove.push(id);
        return;
      }
      if (hitWall) {
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

      // Barrel hit detection (one-shot explosion)
      if (!hit) {
        this.state.barrels.forEach((barrel, barrelId) => {
          if (hit || barrel.exploded) return;
          const dx = bullet.x - barrel.x;
          const dy = bullet.y - barrel.y;
          const r = BARREL_HITBOX_RADIUS + (wep?.bulletRadius ?? 4);
          if (dx * dx + dy * dy < r * r) {
            this.explodeBarrel(barrelId, bullet.ownerId);
            toRemove.push(id);
            hit = true;
          }
        });
      }

      // Vehicle hit detection
      if (!hit) {
        this.state.vehicles.forEach((vehicle, vId) => {
          if (hit || vehicle.destroyed) return;
          // Don't damage your own vehicle while inside it
          if (vehicle.driverId === bullet.ownerId) return;
          if (vehicle.passengerIds.indexOf(bullet.ownerId) !== -1) return;
          const dx = bullet.x - vehicle.x;
          const dy = bullet.y - vehicle.y;
          const vRadius = vehicle.type === "tank" ? TANK_RADIUS : vehicle.type === "truck" ? TRUCK_RADIUS : JEEP_RADIUS;
          const r = vRadius + (wep?.bulletRadius ?? 4);
          if (dx * dx + dy * dy < r * r) {
            const target = vehicle.type as DamageTarget;
            const dmg = wep ? getDamage(wep.damageSource, target) : 2;
            vehicle.hp = Math.max(0, vehicle.hp - dmg);
            this.broadcast("vehicleHit", { vehicleId: vId, x: vehicle.x, y: vehicle.y });
            if (vehicle.hp <= 0) {
              this.destroyVehicle(vehicle, vId, bullet.ownerId);
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

    // Revival logic
    this.state.players.forEach((downed) => {
      if (!downed.isDowned || downed.isDead) {
        if (downed.reviveProgress > 0) downed.reviveProgress = 0;
        downed.reviverIds = "";
        return;
      }

      const activeRevivers: PlayerSchema[] = [];
      this.state.players.forEach((reviver) => {
        if (reviver.id === downed.id) return;
        if (reviver.isDowned || reviver.isDead) return;
        if (!this.isReviving(reviver.id)) return;
        const d = Math.hypot(reviver.x - downed.x, reviver.y - downed.y);
        if (d > REVIVE_RANGE) return;
        activeRevivers.push(reviver);
      });

      downed.reviverIds = activeRevivers.map((r) => r.id).join(",");

      if (activeRevivers.length === 0) {
        downed.reviveProgress = Math.max(0, downed.reviveProgress - deltaTime / 2000);
        return;
      }

      const rate = activeRevivers.length * (deltaTime / REVIVE_DURATION_MS);
      downed.reviveProgress = Math.min(1.0, downed.reviveProgress + rate);

      if (downed.reviveProgress >= 1.0) {
        this.reviveDowned(downed, activeRevivers);
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

  private initializeBarrels() {
    PATRIOT_MAP.barrels.forEach((def) => {
      const b = new BarrelSchema();
      b.id = def.id;
      b.x = def.x;
      b.y = def.y;
      this.state.barrels.set(b.id, b);
    });
    console.log(`[Room ${this.state.code}] Initialized ${PATRIOT_MAP.barrels.length} barrels`);
  }

  private initializeVehicles() {
    PATRIOT_MAP.vehicles.forEach((def) => {
      const v = new VehicleSchema();
      v.id = def.id;
      v.type = def.type;
      v.x = def.x;
      v.y = def.y;
      v.rotation = def.rotation ?? 0;
      v.hp = def.type === "jeep" ? JEEP_HP : def.type === "truck" ? TRUCK_HP : TANK_HP;
      this.state.vehicles.set(v.id, v);
    });
    console.log(`[Room ${this.state.code}] Initialized ${PATRIOT_MAP.vehicles.length} vehicles`);
  }

  private enterVehicle(player: PlayerSchema, sessionId: string, vehicle: VehicleSchema) {
    if (player.carriedBarrelId) return;

    if (vehicle.type === "jeep") {
      if (vehicle.driverId) return;
      vehicle.driverId = sessionId;
      player.inVehicleId = vehicle.id;
      player.x = vehicle.x;
      player.y = vehicle.y;
      this.broadcast("vehicleEntered", { vehicleId: vehicle.id, playerId: sessionId, role: "driver" });
    } else if (vehicle.type === "truck") {
      if (!vehicle.driverId) {
        vehicle.driverId = sessionId;
        player.inVehicleId = vehicle.id;
        player.x = vehicle.x;
        player.y = vehicle.y;
        this.broadcast("vehicleEntered", { vehicleId: vehicle.id, playerId: sessionId, role: "driver" });
      } else if (vehicle.passengerIds.length < TRUCK_CAPACITY - 1) {
        vehicle.passengerIds.push(sessionId);
        player.inVehicleId = vehicle.id;
        player.x = vehicle.x;
        player.y = vehicle.y;
        this.broadcast("vehicleEntered", { vehicleId: vehicle.id, playerId: sessionId, role: "passenger" });
      }
    } else if (vehicle.type === "tank") {
      if (vehicle.driverId) return;
      vehicle.driverId = sessionId;
      player.inVehicleId = vehicle.id;
      player.x = vehicle.x;
      player.y = vehicle.y;
      player.previousWeapon = player.currentWeapon;
      player.currentWeapon = "tank_cannon";
      this.broadcast("vehicleEntered", { vehicleId: vehicle.id, playerId: sessionId, role: "driver" });
    }
  }

  private exitVehicle(player: PlayerSchema, sessionId: string) {
    const vehicle = this.state.vehicles.get(player.inVehicleId);
    if (!vehicle) {
      player.inVehicleId = "";
      return;
    }

    // Restore previous weapon if exiting a tank
    if (vehicle.type === "tank" && player.previousWeapon) {
      player.currentWeapon = player.previousWeapon;
      player.previousWeapon = "";
    }

    let angle: number;
    if (vehicle.driverId === sessionId) {
      vehicle.driverId = "";
      angle = vehicle.rotation;
    } else {
      const idx = vehicle.passengerIds.indexOf(sessionId);
      if (idx !== -1) vehicle.passengerIds.splice(idx, 1);
      const sideAngles = [Math.PI / 2, -Math.PI / 2, Math.PI];
      angle = vehicle.rotation + sideAngles[Math.max(0, idx) % 3];
    }

    const exitX = vehicle.x + Math.cos(angle) * 55;
    const exitY = vehicle.y + Math.sin(angle) * 55;
    player.x = checkWallCollision(exitX, exitY, PLAYER_RADIUS) ? vehicle.x : exitX;
    player.y = checkWallCollision(exitX, exitY, PLAYER_RADIUS) ? vehicle.y : exitY;

    player.inVehicleId = "";
    this.broadcast("vehicleExited", { vehicleId: vehicle.id, playerId: sessionId });
  }

  private driveVehicle(vehicle: VehicleSchema, input: InputCommand, dt: number) {
    let mx = input.moveX;
    let my = input.moveY;
    const mag = Math.sqrt(mx * mx + my * my);
    if (mag > 1) { mx /= mag; my /= mag; }

    const speed = vehicle.type === "tank" ? TANK_SPEED : vehicle.type === "truck" ? TRUCK_SPEED : JEEP_SPEED;
    const rotSpeed = vehicle.type === "tank" ? TANK_ROTATION_SPEED : vehicle.type === "truck" ? TRUCK_ROTATION_SPEED : JEEP_ROTATION_SPEED;
    const radius = vehicle.type === "tank" ? TANK_RADIUS : vehicle.type === "truck" ? TRUCK_RADIUS : JEEP_RADIUS;

    const targetVx = mx * speed;
    const targetVy = my * speed;

    vehicle.vx += (targetVx - vehicle.vx) * 0.1;
    vehicle.vy += (targetVy - vehicle.vy) * 0.1;

    const newX = vehicle.x + vehicle.vx * (dt / 1000);
    const newY = vehicle.y + vehicle.vy * (dt / 1000);

    if (!checkWallCollision(newX, newY, radius)) {
      vehicle.x = newX;
      vehicle.y = newY;
    } else if (!checkWallCollision(newX, vehicle.y, radius)) {
      vehicle.x = newX;
      vehicle.vy *= 0.5;
    } else if (!checkWallCollision(vehicle.x, newY, radius)) {
      vehicle.y = newY;
      vehicle.vx *= 0.5;
    } else {
      vehicle.vx = 0;
      vehicle.vy = 0;
    }

    // Clamp to map
    vehicle.x = Math.max(radius, Math.min(PATRIOT_MAP.width - radius, vehicle.x));
    vehicle.y = Math.max(radius, Math.min(PATRIOT_MAP.height - radius, vehicle.y));

    // Rotation follows velocity
    if (Math.abs(vehicle.vx) > 5 || Math.abs(vehicle.vy) > 5) {
      const targetRot = Math.atan2(vehicle.vy, vehicle.vx);
      let diff = targetRot - vehicle.rotation;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      vehicle.rotation += Math.sign(diff) * Math.min(Math.abs(diff), rotSpeed * (dt / 1000));
    }
  }

  destroyVehicle(vehicle: VehicleSchema, vId: string, killerId: string) {
    if (vehicle.destroyed) return;
    vehicle.destroyed = true;

    // Eject driver with heavy damage
    if (vehicle.driverId) {
      const driver = this.state.players.get(vehicle.driverId);
      if (driver) {
        driver.inVehicleId = "";
        driver.hp = Math.max(0, driver.hp - 50);
        if (driver.hp <= 0) this.downPlayer(driver, vehicle.driverId, killerId);
      }
      vehicle.driverId = "";
    }

    // Eject passengers with heavy damage
    vehicle.passengerIds.forEach((pid) => {
      const passenger = this.state.players.get(pid);
      if (passenger) {
        passenger.inVehicleId = "";
        passenger.hp = Math.max(0, passenger.hp - 50);
        if (passenger.hp <= 0) this.downPlayer(passenger, pid, killerId);
      }
    });
    vehicle.passengerIds.clear();

    // Small explosion
    this.broadcast("explosion", { x: vehicle.x, y: vehicle.y, radius: 100, source: "barrel_explosion" });
    applyAoE(this, {
      source: "barrel_explosion",
      x: vehicle.x,
      y: vehicle.y,
      radius: 100,
      attackerId: killerId,
      attackerFaction: this.attackerFactionOf(killerId),
      ignoreFriendlyFire: true,
    });

    this.clock.setTimeout(() => this.state.vehicles.delete(vId), 3000);
  }

  explodeBarrel(barrelId: string, attackerId: string) {
    const barrel = this.state.barrels.get(barrelId);
    if (!barrel || barrel.exploded) return;
    barrel.exploded = true;

    // If carried, detach from carrier
    if (barrel.carriedBy) {
      const carrier = this.state.players.get(barrel.carriedBy);
      if (carrier) carrier.carriedBarrelId = "";
      barrel.carriedBy = "";
    }

    this.broadcast("explosion", {
      x: barrel.x,
      y: barrel.y,
      radius: BARREL_EXPLOSION_RADIUS,
      source: "barrel_explosion",
    });

    applyAoE(this, {
      source: "barrel_explosion",
      x: barrel.x,
      y: barrel.y,
      radius: BARREL_EXPLOSION_RADIUS,
      attackerId,
      attackerFaction: this.attackerFactionOf(attackerId),
      ignoreFriendlyFire: true,
    });

    // Alert nearby AI — explosions are louder than gunshots
    this.aiManager.broadcastSound(barrel.x, barrel.y, "explosion", BARREL_EXPLOSION_RADIUS * 2);

    // Remove barrel from state after a short delay (let chain trigger)
    this.clock.setTimeout(() => this.state.barrels.delete(barrelId), 200);
  }

  private spawnGrenade(player: PlayerSchema, sessionId: string) {
    const grenade = new BulletSchema();
    grenade.id = `g_${++this.bulletIdCounter}`;
    grenade.ownerId = sessionId;
    grenade.weaponId = "grenade";
    grenade.x = player.x + Math.cos(player.aimAngle) * 30;
    grenade.y = player.y + Math.sin(player.aimAngle) * 30;
    grenade.vx = Math.cos(player.aimAngle) * WEAPONS.grenade.bulletSpeed;
    grenade.vy = Math.sin(player.aimAngle) * WEAPONS.grenade.bulletSpeed;
    grenade.spawnedAt = Date.now();
    this.state.bullets.set(grenade.id, grenade);

    // Alert nearby AI
    this.aiManager.broadcastSound(player.x, player.y);
  }

  private detonateGrenade(grenade: BulletSchema) {
    this.broadcast("explosion", {
      x: grenade.x,
      y: grenade.y,
      radius: GRENADE_AOE_RADIUS,
      source: "grenade_explosion",
    });

    applyAoE(this, {
      source: "grenade_explosion",
      x: grenade.x,
      y: grenade.y,
      radius: GRENADE_AOE_RADIUS,
      attackerId: grenade.ownerId,
      attackerFaction: this.attackerFactionOf(grenade.ownerId),
      ignoreFriendlyFire: false,
    });

    this.aiManager.broadcastSound(grenade.x, grenade.y, "explosion", BARREL_EXPLOSION_RADIUS * 2);
  }

  private detonateRocket(rocket: BulletSchema) {
    const isTankCannon = rocket.weaponId === "tank_cannon";
    const radius = isTankCannon ? TANK_CANNON_AOE_RADIUS : BAZOOKA_AOE_RADIUS;
    const source = isTankCannon ? "tank_cannon" : "bazooka_rocket";

    this.broadcast("explosion", {
      x: rocket.x,
      y: rocket.y,
      radius,
      source,
    });

    applyAoE(this, {
      source: source as any,
      x: rocket.x,
      y: rocket.y,
      radius,
      attackerId: rocket.ownerId,
      attackerFaction: this.attackerFactionOf(rocket.ownerId),
      ignoreFriendlyFire: false,
    });

    this.aiManager.broadcastSound(rocket.x, rocket.y, "explosion", 1000);
  }

  private pickupBarrel(player: PlayerSchema, sessionId: string, barrel: BarrelSchema) {
    barrel.carriedBy = sessionId;
    player.carriedBarrelId = barrel.id;
    this.broadcast("barrelPickedUp", { playerId: sessionId, barrelId: barrel.id });
  }

  private dropBarrel(player: PlayerSchema, sessionId: string) {
    const barrel = this.state.barrels.get(player.carriedBarrelId);
    if (barrel) {
      barrel.carriedBy = "";
      barrel.x = player.x;
      barrel.y = player.y;
    }
    const barrelId = player.carriedBarrelId;
    player.carriedBarrelId = "";
    this.broadcast("barrelDropped", { playerId: sessionId, barrelId });
  }

  private attackerFactionOf(attackerId: string): "player" | "ai" {
    return attackerId.startsWith("ai_") ? "ai" : "player";
  }

  applyAoEDamageToPlayer(p: PlayerSchema, id: string, dmg: number, params: AoEParams) {
    if (p.isDowned || p.isDead) return;

    // Damage interrupts reviving
    this.revivingMap.delete(id);

    p.hp = Math.max(0, p.hp - dmg);
    p.damageTaken += dmg;

    const attacker = this.state.players.get(params.attackerId);
    if (attacker) attacker.damageDealt += dmg;

    this.broadcast("damage", {
      targetId: id,
      attackerId: params.attackerId,
      amount: dmg,
      x: p.x,
      y: p.y,
      source: params.source,
    });

    if (p.hp <= 0) {
      this.downPlayer(p, id, params.attackerId);
    }
  }

  private downPlayer(p: PlayerSchema, id: string, attackerId: string) {
    // Exit vehicle before going down
    if (p.inVehicleId) this.exitVehicle(p, id);
    // Drop carried barrel before going down
    if (p.carriedBarrelId) this.dropBarrel(p, id);

    p.isDowned = true;
    p.hp = 0;
    p.downedAt = Date.now();
    p.downedBy = attackerId;

    const killer = this.state.players.get(attackerId);
    if (killer) {
      killer.kills++;
      this.checkPromotion(killer, attackerId);
    }

    this.broadcast("playerDowned", {
      victimId: id,
      killerId: attackerId,
    });
  }

  applyAoEDamageToAI(
    ai: import("./schema/AISchema.js").AISchema,
    aiId: string,
    dmg: number,
    params: AoEParams
  ) {
    if (ai.isDead) return;
    ai.hp = Math.max(0, ai.hp - dmg);

    this.broadcast("damage", {
      targetId: aiId,
      attackerId: params.attackerId,
      amount: dmg,
      x: ai.x,
      y: ai.y,
      source: params.source,
    });

    if (ai.hp <= 0) {
      ai.isDead = true;
      ai.behaviorState = "dead";
      ai.deathTime = Date.now();
      this.state.totalAIKilled++;
      this.broadcast("aiKilled", { aiId, killerId: params.attackerId, x: ai.x, y: ai.y });
      const killer = this.state.players.get(params.attackerId);
      if (killer) {
        killer.kills++;
        this.checkPromotion(killer, params.attackerId);
      }
    }
  }

  /** Public wrapper for AoE system to destroy crates */
  destroyCratePublic(crate: CrateSchema, crateId: string) {
    this.destroyCrate(crate, crateId);
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

  private attemptPickup(player: PlayerSchema, pickup: PickupSchema, pickupId: string, client?: Client) {
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

        // Rank check
        if (!canUseWeapon(player.rank as RankId, weaponId)) {
          client?.send("pickupBlocked", {
            pickupId: pickup.id,
            reason: "rank",
            requiredRank: getRankRequiredForWeapon(weaponId)?.name || "Unknown",
          });
          return;
        }

        if (weaponId === "grenade") {
          if (player.grenadeCount >= MAX_GRENADES) return; // Full — grenade stays
          player.grenadeCount = Math.min(MAX_GRENADES, player.grenadeCount + 3);
        } else {
          player.currentWeapon = weaponId;
          const def = WEAPONS[weaponId];
          if (def.ammo !== "unlimited") player.ammo = def.ammo as number; // Set or refill ammo
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
    this.state.players.forEach((p, pid) => {
      if (p.isDead) {
        if (p.carriedBarrelId) this.dropBarrel(p, pid);
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

    // Damage interrupts reviving
    this.revivingMap.delete(targetId);

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
      this.downPlayer(target, targetId, bullet.ownerId);
    }
  }

  private isReviving(sessionId: string): boolean {
    const t = this.revivingMap.get(sessionId);
    if (!t) return false;
    return Date.now() - t < 250;
  }

  private reviveDowned(downed: PlayerSchema, revivers: PlayerSchema[]) {
    downed.isDowned = false;
    downed.hp = REVIVE_RESULT_HP;
    downed.currentWeapon = "pistol";
    downed.grenadeCount = 0;
    downed.reviveProgress = 0;
    downed.reviverIds = "";
    downed.downedAt = 0;
    downed.downedBy = "";

    revivers.forEach((r) => { r.revives++; });

    this.broadcast("playerRevived", {
      playerId: downed.id,
      reviverIds: revivers.map((r) => r.id),
    });

    console.log(`[Room ${this.state.code}] ${downed.name} revived`);
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
    // If driving a vehicle, apply to vehicle instead
    if (player.inVehicleId) {
      const vehicle = this.state.vehicles.get(player.inVehicleId);
      if (vehicle && vehicle.driverId === player.id) {
        this.driveVehicle(vehicle, input, dt);
      }
      if (vehicle && !vehicle.destroyed) {
        player.x = vehicle.x;
        player.y = vehicle.y;
      }
      player.aimAngle = input.aimAngle;
      return;
    }

    // Normalize & clamp input
    let mx = input.moveX;
    let my = input.moveY;
    const mag = Math.sqrt(mx * mx + my * my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }

    let speed = PLAYER_RUN_SPEED;
    if (player.carriedBarrelId) speed *= BARREL_CARRY_SPEED_MULT;
    const step = speed * (dt / 1000);

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

    // Exit vehicle / drop barrel before removing player
    const leavingPlayer = this.state.players.get(client.sessionId);
    if (leavingPlayer?.inVehicleId) this.exitVehicle(leavingPlayer, client.sessionId);
    if (leavingPlayer?.carriedBarrelId) this.dropBarrel(leavingPlayer, client.sessionId);

    const wasCreator = client.sessionId === this.state.creatorId;
    this.state.players.delete(client.sessionId);
    this.playerInputs.delete(client.sessionId);
    this.revivingMap.delete(client.sessionId);
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
