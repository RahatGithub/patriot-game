import { Schema, type } from "@colyseus/schema";

export class PlayerSchema extends Schema {
  @type("string") id: string;
  @type("string") name: string;
  @type("boolean") isCreator: boolean;
  @type("number") joinedAt: number;
}
