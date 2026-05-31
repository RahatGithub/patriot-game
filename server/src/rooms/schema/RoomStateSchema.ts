import { Schema, MapSchema, type } from "@colyseus/schema";
import { PlayerSchema } from "./PlayerSchema.js";
import { BulletSchema } from "./BulletSchema.js";
import { AISchema } from "./AISchema.js";
import { CheckpointSchema } from "./CheckpointSchema.js";

export class RoomStateSchema extends Schema {
  @type("string") code: string;
  @type("string") creatorId: string;
  @type("number") checkpointCount: number;
  @type("boolean") matchStarted: boolean;
  @type("number") capturedCount: number = 0;
  @type("string") matchState: string = "lobby";
  @type("string") matchResult: string = "";
  @type("number") matchStartedAt: number = 0;
  @type("number") matchEndsAt: number = 0;
  @type("number") timeRemainingMs: number = 0;
  @type("number") totalAISpawned: number = 0;
  @type("number") totalAIKilled: number = 0;
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type({ map: BulletSchema }) bullets = new MapSchema<BulletSchema>();
  @type({ map: AISchema }) ai = new MapSchema<AISchema>();
  @type({ map: CheckpointSchema }) checkpoints = new MapSchema<CheckpointSchema>();
}
