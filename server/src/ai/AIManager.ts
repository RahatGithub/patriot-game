import {
  PATRIOT_MAP,
  AI_WALK_SPEED,
  AI_RADIUS,
  AI_INITIAL_HP,
} from "@patriot/shared";
import { AISchema } from "../rooms/schema/AISchema.js";
import { checkWallCollision } from "../systems/collision.js";
import type { RoomStateSchema } from "../rooms/schema/RoomStateSchema.js";

let aiIdCounter = 0;

export class AIManager {
  private state: RoomStateSchema;

  constructor(state: RoomStateSchema) {
    this.state = state;
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

    this.state.ai.forEach((ai, id) => {
      if (ai.isDead) {
        // Despawn 5s after death
        if (ai.deathTime > 0 && now - ai.deathTime > 5000) {
          toRemove.push(id);
        }
        return;
      }

      switch (ai.behaviorState) {
        case "patrol":
          this.updatePatrol(ai, deltaTime);
          break;
        // alert, chase — Prompts 13-15
      }
    });

    for (const id of toRemove) {
      this.state.ai.delete(id);
    }
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
      // Reached waypoint — advance
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

    // Walk toward waypoint
    const step = AI_WALK_SPEED * (dt / 1000);
    const nx = ai.x + (dx / dist) * step;
    const ny = ai.y + (dy / dist) * step;

    if (!checkWallCollision(nx, ny, AI_RADIUS)) {
      ai.x = nx;
      ai.y = ny;
    } else {
      // Blocked — skip waypoint
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
