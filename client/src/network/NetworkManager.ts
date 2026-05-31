import { Client, Room } from "colyseus.js";

export class NetworkManager {
  private client: Client;
  private room: Room | null = null;
  private serverHttpUrl: string;

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
    return this.room;
  }

  async joinRoom(code: string, playerName: string): Promise<Room> {
    const res = await fetch(`${this.serverHttpUrl}/room/${code}`);
    if (!res.ok) {
      throw new Error("Room not found");
    }
    const { roomId } = await res.json();
    this.room = await this.client.joinById(roomId, { playerName });
    return this.room;
  }

  leaveRoom(): void {
    this.room?.leave();
    this.room = null;
  }

  sendStartMatch(): void {
    this.room?.send("START_MATCH");
  }

  getRoom(): Room | null {
    return this.room;
  }
}
