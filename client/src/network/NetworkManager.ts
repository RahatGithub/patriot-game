import { Client, Room } from "colyseus.js";
import type { InputCommand } from "@patriot/shared";

export class NetworkManager {
  private client: Client;
  private room: Room | null = null;
  private serverHttpUrl: string;

  // Input sending
  private inputSequence = 0;
  pendingInputs: InputCommand[] = [];
  ping = 0;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const wsUrl =
      (import.meta as any).env?.VITE_SERVER_URL || "ws://localhost:2567";
    this.client = new Client(wsUrl);
    this.serverHttpUrl = wsUrl
      .replace("ws://", "http://")
      .replace("wss://", "https://");
  }

  async createRoom(playerName: string, checkpointCount: number): Promise<Room> {
    this.room = await this.client.create("patriot_room", {
      playerName,
      checkpointCount,
    });
    this.setupPing();
    return this.room;
  }

  async joinRoom(code: string, playerName: string): Promise<Room> {
    const res = await fetch(`${this.serverHttpUrl}/room/${code}`);
    if (!res.ok) throw new Error("Room not found");
    const { roomId } = await res.json();
    this.room = await this.client.joinById(roomId, { playerName });
    this.setupPing();
    return this.room;
  }

  leaveRoom(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.room?.leave();
    this.room = null;
    this.inputSequence = 0;
    this.pendingInputs = [];
  }

  sendInput(moveX: number, moveY: number, aimAngle: number, fire: boolean): InputCommand {
    const cmd: InputCommand = {
      sequence: ++this.inputSequence,
      moveX,
      moveY,
      aimAngle,
      fire,
      timestamp: Date.now(),
    };
    this.room?.send("input", cmd);
    this.pendingInputs.push(cmd);
    return cmd;
  }

  /** Drop confirmed inputs and return the server-confirmed position */
  reconcile(lastProcessedInput: number) {
    this.pendingInputs = this.pendingInputs.filter(
      (i) => i.sequence > lastProcessedInput
    );
  }

  sendStartMatch(): void {
    this.room?.send("START_MATCH");
  }

  getRoom(): Room | null {
    return this.room;
  }

  private setupPing() {
    if (!this.room) return;
    this.room.onMessage("pong", (data: { t: number }) => {
      this.ping = Date.now() - data.t;
    });
    this.pingInterval = setInterval(() => {
      this.room?.send("ping", { t: Date.now() });
    }, 2000);
  }
}
