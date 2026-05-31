import { Schema, type } from "@colyseus/schema";

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
}
