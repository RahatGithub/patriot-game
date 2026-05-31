import { Room, Client } from "colyseus";

export class PatriotRoom extends Room {
  onCreate(options: any) {
    console.log("[PatriotRoom] Room created!", options);
  }

  onJoin(client: Client) {
    console.log(`[Server] Client connected: ${client.sessionId}`);
  }

  onLeave(client: Client, consented: boolean) {
    console.log(`[Server] Client disconnected: ${client.sessionId}`);
  }
}
