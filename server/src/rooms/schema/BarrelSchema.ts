import { Schema, type } from "@colyseus/schema";

export class BarrelSchema extends Schema {
  @type("string") id!: string;
  @type("number") x!: number;
  @type("number") y!: number;
  @type("boolean") exploded: boolean = false;
  @type("string") carriedBy: string = "";  // session ID of carrier (Prompt 26)
}
