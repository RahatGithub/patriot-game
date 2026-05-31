import { Schema, type } from "@colyseus/schema";

export class CheckpointSchema extends Schema {
  @type("string") id!: string;
  @type("number") order!: number;
  @type("number") x!: number;
  @type("number") y!: number;
  @type("number") radius!: number;
  @type("boolean") captured: boolean = false;
  @type("number") capturedAt: number = 0;
  @type("number") captureProgress: number = 0;
  @type("string") capturingPlayerIds: string = "";
}
