import {
  PATRIOT_MAP,
  AI_WALK_SPEED,
  AI_RUN_SPEED,
  AI_RADIUS,
  AI_INITIAL_HP,
  AI_VISION_RANGE,
  AI_VISION_ARC,
  AI_VISION_ALERT_RANGE_MULT,
  AI_VISION_TICK_INTERVAL,
  AI_SOUND_RANGE,
  AI_ALERT_DURATION_MS,
  AI_ALERT_TURN_SPEED,
  AI_CHASE_LOSE_TARGET_MS,
  AI_SHOOT_RANGE,
  AI_SHOOT_AIM_VARIATION,
  AI_FIRE_REACTION_DELAY_MS,
  AI_CHASE_DESIRED_DISTANCE,
  WEAPONS,
  WAVE_BASE_COUNT,
  WAVE_SCALING_FACTOR,
  WAVE_MAX_AI_ALIVE,
} from "@patriot/shared";
import type { WeaponId } from "@patriot/shared";
import { AISchema } from "../rooms/schema/AISchema.js";
import { BulletSchema } from "../rooms/schema/BulletSchema.js";
import type { PlayerSchema } from "../rooms/schema/PlayerSchema.js";
import { checkWallCollision } from "../systems/collision.js";
import { segmentIntersectsRect } from "../systems/geometry.js";
import type { RoomStateSchema } from "../rooms/schema/RoomStateSchema.js";

let aiIdCounter = 0;
let bulletCounter = 0;

function lerpAngle(from: number, to: number, maxStep: number): number {
  let diff = to - from;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return from + Math.sign(diff) * Math.min(Math.abs(diff), maxStep);
}

export class AIManager {
  private state: RoomStateSchema;
  private lastSightCheck = 0;
  private roomCode = "";

  constructor(state: RoomStateSchema) {
    this.state = state;
    this.roomCode = state.code;
  }

  spawnInitial() {
    for (const def of PATRIOT_MAP.initialAISpawns) {
      this.spawnOne(def);
    }
  }

  spawnWave(waveNumber: number) {
    const target = Math.floor(WAVE_BASE_COUNT * Math.pow(WAVE_SCALING_FACTOR, waveNumber - 1));
    const currentAlive = this.countAlive();
    const toSpawn = Math.min(target, WAVE_MAX_AI_ALIVE - currentAlive);

    for (let i = 0; i < toSpawn; i++) {
      const spawnDef = this.pickSpawnPoint(waveNumber);
      this.spawnOne(spawnDef);
    }
    this.state.totalAISpawned += toSpawn;

    console.log(
      `[Room ${this.roomCode}] Wave ${waveNumber}: spawned ${toSpawn} mafia (${currentAlive + toSpawn} alive)`
    );
  }

  private pickSpawnPoint(waveNumber: number): { spawnPointIndex: number; patrolPathId: string; weapon: "pistol" | "mk18" | "mg" } {
    const spawnIdx = Math.floor(Math.random() * PATRIOT_MAP.enemySpawnPoints.length);
    const patrolPath = PATRIOT_MAP.patrolPaths[spawnIdx % PATRIOT_MAP.patrolPaths.length];

    let weapon: "pistol" | "mk18" | "mg" = "mk18";
    const roll = Math.random();
    if (waveNumber === 1) {
      weapon = roll < 0.5 ? "pistol" : "mk18";
    } else if (waveNumber <= 3) {
      weapon = roll < 0.2 ? "pistol" : roll < 0.8 ? "mk18" : "mg";
    } else {
      weapon = roll < 0.5 ? "mk18" : "mg";
    }

    return { spawnPointIndex: spawnIdx, patrolPathId: patrolPath.id, weapon };
  }

  countAlive(): number {
    let n = 0;
    this.state.ai.forEach((a) => { if (!a.isDead) n++; });
    return n;
  }

  private spawnOne(def: { spawnPointIndex: number; patrolPathId: string; weapon: string }) {
    const sp = PATRIOT_MAP.enemySpawnPoints[def.spawnPointIndex];
    if (!sp) return;
    const ai = new AISchema();
    ai.id = `ai_${++aiIdCounter}`;
    ai.x = sp.x;
    ai.y = sp.y;
    ai.weapon = def.weapon;
    ai.patrolPathId = def.patrolPathId;
    ai.hp = AI_INITIAL_HP;
    this.state.ai.set(ai.id, ai);
  }

  broadcastSound(x: number, y: number) {
    this.state.ai.forEach((ai) => {
      if (ai.isDead || ai.behaviorState === "chase") return;
      if (Math.hypot(x - ai.x, y - ai.y) <= AI_SOUND_RANGE) {
        this.enterAlertState(ai, x, y);
      }
    });
  }

  update(deltaTime: number) {
    if (this.state.matchState === "ended") return;

    const now = Date.now();
    const toRemove: string[] = [];
    const doSight = now - this.lastSightCheck >= AI_VISION_TICK_INTERVAL;
    if (doSight) this.lastSightCheck = now;

    this.state.ai.forEach((ai, id) => {
      if (ai.isDead) {
        if (ai.deathTime > 0 && now - ai.deathTime > 5000) toRemove.push(id);
        return;
      }
      if (doSight && ai.behaviorState !== "chase") {
        this.checkSight(ai);
      }
      switch (ai.behaviorState) {
        case "patrol": this.updatePatrol(ai, deltaTime); break;
        case "alert": this.updateAlert(ai, deltaTime); break;
        case "chase": this.updateChase(ai, deltaTime); break;
      }
    });

    for (const id of toRemove) this.state.ai.delete(id);
  }

  // --- State transitions ---

  private checkSight(ai: AISchema): PlayerSchema | null {
    const spotted = this.findVisiblePlayer(ai);
    if (spotted) {
      this.enterAlertState(ai, spotted.x, spotted.y, spotted.id);
      return spotted;
    }
    return null;
  }

  private enterAlertState(ai: AISchema, x: number, y: number, targetId = "") {
    const wasPatrol = ai.behaviorState === "patrol";
    ai.behaviorState = "alert";
    ai.alertStartedAt = Date.now();
    ai.targetX = x;
    ai.targetY = y;
    if (targetId) ai.alertTargetId = targetId;
    if (wasPatrol) console.log(`[Room ${this.roomCode}] Mafia ${ai.id} alerted`);
  }

  private enterChaseState(ai: AISchema, target: PlayerSchema) {
    ai.behaviorState = "chase";
    ai.alertTargetId = target.id;
    ai.targetX = target.x;
    ai.targetY = target.y;
    ai.chaseStartedAt = Date.now();
    ai.lastSawTargetAt = Date.now();
    ai.lastFireAt = Date.now(); // reaction delay starts
    console.log(`[Room ${this.roomCode}] Mafia ${ai.id} chasing ${target.name}`);
  }

  private loseTargetThenPatrol(ai: AISchema) {
    // Go to alert briefly, then naturally decay to patrol
    ai.behaviorState = "alert";
    ai.alertStartedAt = Date.now();
  }

  private returnToPatrol(ai: AISchema) {
    ai.behaviorState = "patrol";
    ai.alertTargetId = "";
    const path = PATRIOT_MAP.patrolPaths.find((p) => p.id === ai.patrolPathId);
    if (path) {
      let nearestIdx = 0;
      let nearestDist = Infinity;
      path.waypoints.forEach((wp, i) => {
        const d = Math.hypot(wp.x - ai.x, wp.y - ai.y);
        if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
      });
      ai.currentWaypointIdx = nearestIdx;
    }
  }

  // --- Behavior updates ---

  private updateAlert(ai: AISchema, dt: number) {
    const dx = ai.targetX - ai.x;
    const dy = ai.targetY - ai.y;
    ai.aimAngle = lerpAngle(ai.aimAngle, Math.atan2(dy, dx), AI_ALERT_TURN_SPEED * (dt / 1000));

    const spotted = this.findVisiblePlayer(ai);
    if (spotted) {
      this.enterChaseState(ai, spotted);
      return;
    }

    if (Date.now() - ai.alertStartedAt > AI_ALERT_DURATION_MS) {
      this.returnToPatrol(ai);
    }
  }

  private updateChase(ai: AISchema, dt: number) {
    const target = this.state.players.get(ai.alertTargetId);
    if (!target || target.isDowned || target.isDead) {
      return this.loseTargetThenPatrol(ai);
    }

    const stillVisible = this.canSeePlayer(ai, target);
    if (stillVisible) {
      ai.targetX = target.x;
      ai.targetY = target.y;
      ai.lastSawTargetAt = Date.now();
    } else if (Date.now() - ai.lastSawTargetAt > AI_CHASE_LOSE_TARGET_MS) {
      return this.loseTargetThenPatrol(ai);
    }

    const dx = ai.targetX - ai.x;
    const dy = ai.targetY - ai.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const aimAngle = Math.atan2(dy, dx);
    ai.aimAngle = lerpAngle(ai.aimAngle, aimAngle, AI_ALERT_TURN_SPEED * 2 * (dt / 1000));

    // Movement
    if (dist > AI_CHASE_DESIRED_DISTANCE) {
      this.tryMoveAI(ai, (dx / dist) * AI_RUN_SPEED, (dy / dist) * AI_RUN_SPEED, dt);
    } else if (dist < AI_CHASE_DESIRED_DISTANCE * 0.6) {
      this.tryMoveAI(ai, -(dx / dist) * AI_WALK_SPEED, -(dy / dist) * AI_WALK_SPEED, dt);
    }

    // Shooting
    if (stillVisible && dist <= AI_SHOOT_RANGE) {
      this.tryAIShoot(ai);
    }
  }

  private tryMoveAI(ai: AISchema, vx: number, vy: number, dt: number) {
    const nx = ai.x + vx * (dt / 1000);
    const ny = ai.y + vy * (dt / 1000);

    if (!checkWallCollision(nx, ny, AI_RADIUS)) { ai.x = nx; ai.y = ny; return; }
    if (!checkWallCollision(nx, ai.y, AI_RADIUS)) { ai.x = nx; return; }
    if (!checkWallCollision(ai.x, ny, AI_RADIUS)) { ai.y = ny; return; }

    // Sidestep
    const perp = Math.atan2(vy, vx) + Math.PI / 2;
    const ox = Math.cos(perp) * 10;
    const oy = Math.sin(perp) * 10;
    if (!checkWallCollision(ai.x + ox, ai.y + oy, AI_RADIUS)) {
      ai.x += ox;
      ai.y += oy;
    }
  }

  private tryAIShoot(ai: AISchema) {
    const now = Date.now();
    const wep = WEAPONS[ai.weapon as WeaponId];
    if (!wep) return;

    if (now - ai.chaseStartedAt < AI_FIRE_REACTION_DELAY_MS) return;
    if (now - ai.lastFireAt < 1000 / wep.fireRatePerSec) return;

    const spread = (Math.random() * 2 - 1) * (wep.spread + AI_SHOOT_AIM_VARIATION) / 2;
    const aimWithSpread = ai.aimAngle + spread;

    const bullet = new BulletSchema();
    bullet.id = `ab${++bulletCounter}`;
    bullet.ownerId = ai.id; // already starts with 'ai_'
    bullet.weaponId = ai.weapon;
    bullet.x = ai.x + Math.cos(ai.aimAngle) * 30;
    bullet.y = ai.y + Math.sin(ai.aimAngle) * 30;
    bullet.vx = Math.cos(aimWithSpread) * wep.bulletSpeed;
    bullet.vy = Math.sin(aimWithSpread) * wep.bulletSpeed;
    bullet.spawnedAt = now;
    this.state.bullets.set(bullet.id, bullet);

    ai.lastFireAt = now;
    this.broadcastSound(ai.x, ai.y);
  }

  // --- Vision helpers ---

  canSeePlayer(ai: AISchema, player: PlayerSchema): boolean {
    if (player.isDowned || player.isDead) return false;
    const dx = player.x - ai.x;
    const dy = player.y - ai.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const range = AI_VISION_RANGE * (ai.behaviorState === "patrol" ? 1 : AI_VISION_ALERT_RANGE_MULT);
    if (dist > range) return false;

    const angle = Math.atan2(dy, dx);
    let diff = angle - ai.aimAngle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    if (Math.abs(diff) > AI_VISION_ARC / 2) return false;

    return this.hasLineOfSight(ai.x, ai.y, player.x, player.y);
  }

  findVisiblePlayer(ai: AISchema): PlayerSchema | null {
    const range = AI_VISION_RANGE * (ai.behaviorState === "patrol" ? 1 : AI_VISION_ALERT_RANGE_MULT);
    const halfArc = AI_VISION_ARC / 2;
    let closest: PlayerSchema | null = null;
    let closestDist = range + 1;

    this.state.players.forEach((player) => {
      if (player.isDowned || player.isDead) return;
      const dx = player.x - ai.x;
      const dy = player.y - ai.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > range) return;

      const angle = Math.atan2(dy, dx);
      let diff = angle - ai.aimAngle;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      if (Math.abs(diff) > halfArc) return;
      if (!this.hasLineOfSight(ai.x, ai.y, player.x, player.y)) return;

      if (dist < closestDist) { closest = player; closestDist = dist; }
    });
    return closest;
  }

  hasLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
    for (const wall of PATRIOT_MAP.walls) {
      if (segmentIntersectsRect(x1, y1, x2, y2, wall)) return false;
    }
    return true;
  }

  // --- Patrol ---

  private updatePatrol(ai: AISchema, dt: number) {
    const path = PATRIOT_MAP.patrolPaths.find((p) => p.id === ai.patrolPathId);
    if (!path || path.waypoints.length === 0) return;

    const wp = path.waypoints[ai.currentWaypointIdx];
    if (!wp) return;

    const dx = wp.x - ai.x;
    const dy = wp.y - ai.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 5) {
      if (path.loop) {
        ai.currentWaypointIdx = (ai.currentWaypointIdx + 1) % path.waypoints.length;
      } else {
        ai.currentWaypointIdx += ai.patrolDirection;
        if (ai.currentWaypointIdx >= path.waypoints.length) {
          ai.currentWaypointIdx = path.waypoints.length - 2; ai.patrolDirection = -1;
        } else if (ai.currentWaypointIdx < 0) {
          ai.currentWaypointIdx = 1; ai.patrolDirection = 1;
        }
      }
      return;
    }

    const step = AI_WALK_SPEED * (dt / 1000);
    const nx = ai.x + (dx / dist) * step;
    const ny = ai.y + (dy / dist) * step;

    if (!checkWallCollision(nx, ny, AI_RADIUS)) {
      ai.x = nx; ai.y = ny;
    } else {
      if (path.loop) {
        ai.currentWaypointIdx = (ai.currentWaypointIdx + 1) % path.waypoints.length;
      } else {
        ai.currentWaypointIdx += ai.patrolDirection;
      }
    }
    ai.aimAngle = Math.atan2(dy, dx);
  }
}
