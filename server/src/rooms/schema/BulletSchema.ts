import { Schema, type } from "@colyseus/schema";

export class BulletSchema extends Schema {
  @type("string") id: string;
  @type("string") ownerId: string;
  @type("string") weaponId: string;
  @type("number") x: number;
  @type("number") y: number;
  @type("number") vx: number;
  @type("number") vy: number;
  @type("number") spawnedAt: number;
}
