import { Schema, MapSchema, type } from "@colyseus/schema";
import { PlayerSchema } from "./PlayerSchema.js";

export class RoomStateSchema extends Schema {
  @type("string") code: string;
  @type("string") creatorId: string;
  @type("number") checkpointCount: number;
  @type("boolean") matchStarted: boolean;
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
}
