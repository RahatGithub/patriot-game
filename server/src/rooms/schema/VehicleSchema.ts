import { Schema, ArraySchema, type } from "@colyseus/schema";

export class VehicleSchema extends Schema {
  @type("string") id!: string;
  @type("string") type!: string;
  @type("number") x!: number;
  @type("number") y!: number;
  @type("number") rotation: number = 0;
  @type("number") vx: number = 0;
  @type("number") vy: number = 0;
  @type("number") hp!: number;
  @type("boolean") destroyed: boolean = false;
  @type("string") driverId: string = "";
  @type(["string"]) passengerIds = new ArraySchema<string>();
}
