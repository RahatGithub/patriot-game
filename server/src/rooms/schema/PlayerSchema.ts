import { Schema, type } from "@colyseus/schema";

export class PlayerSchema extends Schema {
  @type("string") id: string;
  @type("string") name: string;
  @type("boolean") isCreator: boolean;
  @type("number") joinedAt: number;

  // Game state
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") aimAngle: number = 0;
  @type("number") hp: number = 100;
  @type("boolean") isDowned: boolean = false;
  @type("boolean") isDead: boolean = false;
  @type("string") rank: string = "soldier";
  @type("number") lastProcessedInput: number = 0;

  // Weapon state
  @type("string") currentWeapon: string = "pistol";
  @type("number") ammo: number = 30;
  @type("number") lastFireTimestamp: number = 0;

  // Combat tracking
  @type("number") downedAt: number = 0;
  @type("string") downedBy: string = "";
  @type("number") kills: number = 0;
  @type("number") deaths: number = 0;
  @type("number") shotsFired: number = 0;
  @type("number") shotsHit: number = 0;
  @type("number") damageDealt: number = 0;
  @type("number") damageTaken: number = 0;
  @type("number") checkpointsCaptured: number = 0;
  @type("number") revives: number = 0;
}
