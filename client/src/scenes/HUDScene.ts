import Phaser from "phaser";

export class HUDScene extends Phaser.Scene {
  private hpText!: Phaser.GameObjects.Text;
  private weaponText!: Phaser.GameObjects.Text;
  private rankText!: Phaser.GameObjects.Text;

  constructor() {
    super("HUDScene");
  }

  create() {
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

    // --- Bottom-left: HP + weapon ---
    this.add.rectangle(110, H - 50, 200, 60, 0x000000, 0.5).setStrokeStyle(1, 0x555555);
    this.hpText = this.add.text(20, H - 72, "HP: 100/100", {
      fontSize: "16px",
      color: "#4caf50",
    });
    this.weaponText = this.add.text(20, H - 45, "Pistol  30/\u221e", {
      fontSize: "13px",
      color: "#aaa",
    });

    // HP bar
    this.add.rectangle(110, H - 28, 180, 8, 0x333333).setOrigin(0.5);
    this.add.rectangle(110, H - 28, 180, 8, 0x44bb44).setOrigin(0.5);

    // --- Bottom-right: rank + kills ---
    this.rankText = this.add
      .text(W - 30, H - 60, "Soldier \u2605", {
        fontSize: "16px",
        color: "#daa520",
      })
      .setOrigin(1, 0);
    this.add
      .text(W - 30, H - 35, "0 / 10 kills", {
        fontSize: "12px",
        color: "#888",
      })
      .setOrigin(1, 0);

    // --- Leave Match button (top-right) ---
    const leaveBtn = this.add
      .text(W - 20, 70, "\u2715 Leave", {
        fontSize: "16px",
        color: "#ff6666",
        backgroundColor: "rgba(0,0,0,0.6)",
        padding: { left: 10, right: 10, top: 5, bottom: 5 },
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });

    leaveBtn.on("pointerdown", () => {
      this.game.events.emit("leaveMatch");
    });
  }
}
