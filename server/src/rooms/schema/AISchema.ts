import { Schema, type } from "@colyseus/schema";
import { AI_VISION_RANGE, AI_VISION_ARC } from "@patriot/shared";

export class AISchema extends Schema {
  @type("string") id: string;
  @type("string") faction: string = "mafia";
  @type("string") behaviorState: string = "patrol";
  @type("string") weapon: string = "mk18";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") aimAngle: number = 0;
  @type("number") hp: number = 50;
  @type("boolean") isDead: boolean = false;
  @type("string") patrolPathId: string = "";
  @type("number") currentWaypointIdx: number = 0;
  @type("number") patrolDirection: number = 1;
  @type("number") deathTime: number = 0;
  @type("number") visionRange: number = AI_VISION_RANGE;
  @type("number") visionArc: number = AI_VISION_ARC;
  @type("number") alertStartedAt: number = 0;
  @type("number") targetX: number = 0;
  @type("number") targetY: number = 0;
  @type("string") alertTargetId: string = "";
  @type("number") chaseStartedAt: number = 0;
  @type("number") lastSawTargetAt: number = 0;
  @type("number") lastFireAt: number = 0;
}
