import { Schema, type } from "@colyseus/schema";

export class PlayerSchema extends Schema {
  @type("string") id: string;
  @type("string") name: string;
  @type("boolean") isCreator: boolean;
  @type("number") joinedAt: number;

  // Game state (Prompt 08)
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") aimAngle: number = 0;
  @type("number") hp: number = 100;
  @type("boolean") isDowned: boolean = false;
  @type("string") rank: string = "soldier";
  @type("number") lastProcessedInput: number = 0;
}
