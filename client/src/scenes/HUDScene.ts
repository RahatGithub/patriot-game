import Phaser from "phaser";

export class HUDScene extends Phaser.Scene {
  private leaveBtn!: Phaser.GameObjects.Text;

  constructor() {
    super("HUDScene");
  }

  create() {
    // HUD camera: fixed, no scroll
    this.cameras.main.setScroll(0, 0);

    const W = 1920;
    const H = 1080;

    // --- Top-left: mini-map placeholder ---
    this.add.rectangle(90, 90, 150, 150, 0x000000, 0.5).setStrokeStyle(1, 0x555555);
    this.add.text(90, 90, "MAP", { fontSize: "14px", color: "#666" }).setOrigin(0.5);

    // --- Top-center: timer ---
    this.add
      .text(W / 2, 30, "00:00", { fontSize: "28px", color: "#fff", fontStyle: "bold" })
      .setOrigin(0.5, 0);

    // --- Top-right: enemy counter ---
    this.add
      .text(W - 30, 30, "0/0", { fontSize: "20px", color: "#aaa" })
      .setOrigin(1, 0);

    // --- Bottom-left: HP + weapon placeholder ---
    this.add.rectangle(110, H - 50, 200, 50, 0x000000, 0.5).setStrokeStyle(1, 0x555555);
    this.add.text(20, H - 65, "HP: 100", { fontSize: "16px", color: "#4caf50" });
    this.add.text(20, H - 40, "Pistol  30/\u221e", { fontSize: "13px", color: "#aaa" });

    // --- Bottom-right: rank placeholder ---
    this.add
      .text(W - 30, H - 40, "Soldier \u2605", { fontSize: "16px", color: "#daa520" })
      .setOrigin(1, 0.5);

    // --- Leave Match button (top-right) ---
    this.leaveBtn = this.add
      .text(W - 20, 70, "\u2715 Leave", {
        fontSize: "16px",
        color: "#ff6666",
        backgroundColor: "rgba(0,0,0,0.6)",
        padding: { left: 10, right: 10, top: 5, bottom: 5 },
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });

    this.leaveBtn.on("pointerdown", () => {
      this.game.events.emit("leaveMatch");
    });
  }
}
