import Phaser from "phaser";
import { Client } from "colyseus.js";

export class HelloScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super("HelloScene");
  }

  create() {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2 - 50, "Hello Patriot", {
        fontSize: "64px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(width / 2, height / 2 + 30, "Connecting...", {
        fontSize: "24px",
        color: "#aaaaaa",
      })
      .setOrigin(0.5);

    this.connectToServer();
  }

  private async connectToServer() {
    try {
      const client = new Client("ws://localhost:2567");
      const room = await client.joinOrCreate("patriot_room");

      this.statusText.setText("Connected \u2713");
      this.statusText.setColor("#00ff00");

      room.onLeave(() => {
        this.statusText.setText("Disconnected \u2717");
        this.statusText.setColor("#ff0000");
      });
    } catch (e) {
      this.statusText.setText("Disconnected \u2717");
      this.statusText.setColor("#ff0000");
      console.error("Connection error:", e);
    }
  }
}
