import {
  PATRIOT_MAP,
  AI_WALK_SPEED,
  AI_RADIUS,
  AI_INITIAL_HP,
  AI_VISION_RANGE,
  AI_VISION_ARC,
  AI_VISION_ALERT_RANGE_MULT,
  AI_VISION_TICK_INTERVAL,
} from "@patriot/shared";
import { AISchema } from "../rooms/schema/AISchema.js";
import type { PlayerSchema } from "../rooms/schema/PlayerSchema.js";
import { checkWallCollision } from "../systems/collision.js";
import { segmentIntersectsRect } from "../systems/geometry.js";
import type { RoomStateSchema } from "../rooms/schema/RoomStateSchema.js";

let aiIdCounter = 0;

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
      const sp = PATRIOT_MAP.enemySpawnPoints[def.spawnPointIndex];
      if (!sp) continue;

      const ai = new AISchema();
      ai.id = `ai_${++aiIdCounter}`;
      ai.x = sp.x;
      ai.y = sp.y;
      ai.weapon = def.weapon;
      ai.patrolPathId = def.patrolPathId;
      ai.hp = AI_INITIAL_HP;
      ai.currentWaypointIdx = 0;
      ai.patrolDirection = 1;

      this.state.ai.set(ai.id, ai);
    }
  }

  update(deltaTime: number) {
    const now = Date.now();
    const toRemove: string[] = [];
    const doSight = now - this.lastSightCheck >= AI_VISION_TICK_INTERVAL;
    if (doSight) this.lastSightCheck = now;

    this.state.ai.forEach((ai, id) => {
      if (ai.isDead) {
        if (ai.deathTime > 0 && now - ai.deathTime > 5000) {
          toRemove.push(id);
        }
        return;
      }

      if (doSight) {
        this.checkSight(ai);
      }

      switch (ai.behaviorState) {
        case "patrol":
          this.updatePatrol(ai, deltaTime);
          break;
        // alert, chase — Prompts 14-15
      }
    });

    for (const id of toRemove) {
      this.state.ai.delete(id);
    }
  }

  checkSight(ai: AISchema): PlayerSchema | null {
    const spotted = this.findVisiblePlayer(ai);
    if (spotted) {
      // For this prompt: log only — behavior change in Prompt 14
      console.log(
        `[Room ${this.roomCode}] Mafia ${ai.id} spotted player ${spotted.name}`
      );
      return spotted;
    }
    return null;
  }

  findVisiblePlayer(ai: AISchema): PlayerSchema | null {
    const range =
      AI_VISION_RANGE *
      (ai.behaviorState === "patrol" ? 1 : AI_VISION_ALERT_RANGE_MULT);
    const halfArc = AI_VISION_ARC / 2;

    let closest: PlayerSchema | null = null;
    let closestDist = range + 1;

    this.state.players.forEach((player) => {
      if (player.isDowned || player.isDead) return;
      const dx = player.x - ai.x;
      const dy = player.y - ai.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > range) return;

      // Angle check
      const angleToPlayer = Math.atan2(dy, dx);
      let diff = angleToPlayer - ai.aimAngle;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      if (Math.abs(diff) > halfArc) return;

      // Line-of-sight
      if (!this.hasLineOfSight(ai.x, ai.y, player.x, player.y)) return;

      if (dist < closestDist) {
        closest = player;
        closestDist = dist;
      }
    });

    return closest;
  }

  hasLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
    for (const wall of PATRIOT_MAP.walls) {
      if (segmentIntersectsRect(x1, y1, x2, y2, wall)) {
        return false;
      }
    }
    return true;
  }

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
        ai.currentWaypointIdx =
          (ai.currentWaypointIdx + 1) % path.waypoints.length;
      } else {
        ai.currentWaypointIdx += ai.patrolDirection;
        if (ai.currentWaypointIdx >= path.waypoints.length) {
          ai.currentWaypointIdx = path.waypoints.length - 2;
          ai.patrolDirection = -1;
        } else if (ai.currentWaypointIdx < 0) {
          ai.currentWaypointIdx = 1;
          ai.patrolDirection = 1;
        }
      }
      return;
    }

    const step = AI_WALK_SPEED * (dt / 1000);
    const nx = ai.x + (dx / dist) * step;
    const ny = ai.y + (dy / dist) * step;

    if (!checkWallCollision(nx, ny, AI_RADIUS)) {
      ai.x = nx;
      ai.y = ny;
    } else {
      if (path.loop) {
        ai.currentWaypointIdx =
          (ai.currentWaypointIdx + 1) % path.waypoints.length;
      } else {
        ai.currentWaypointIdx += ai.patrolDirection;
      }
    }

    ai.aimAngle = Math.atan2(dy, dx);
  }
}
