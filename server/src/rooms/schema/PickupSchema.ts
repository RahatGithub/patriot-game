import { Schema, type } from "@colyseus/schema";

export class PickupSchema extends Schema {
  @type("string") id!: string;
  @type("string") type!: string;
  @type("number") x!: number;
  @type("number") y!: number;
  @type("number") spawnedAt: number = 0;
}
