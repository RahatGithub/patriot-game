import { Schema, type } from "@colyseus/schema";

export class CrateSchema extends Schema {
  @type("string") id!: string;
  @type("number") x!: number;
  @type("number") y!: number;
  @type("number") hp: number = 20;
  @type("boolean") destroyed: boolean = false;
  @type("string") content!: string;
}
