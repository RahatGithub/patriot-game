import Phaser from "phaser";

const ICON_RADIUS = 12;
const BOB_AMP = 2;
const BOB_FREQ = 0.003;
const GLOW_FREQ = 0.002;

function getPickupColor(type: string): number {
  if (type === "cure") return 0x22bb22;
  if (type.startsWith("weapon_")) return 0xdd8822;
  return 0x888888; // test
}

function getPickupLabel(type: string): string {
  if (type === "cure") return "+";
  if (type === "weapon_pistol") return "P";
  if (type === "weapon_mk18") return "M";
  if (type === "weapon_mg") return "G";
  if (type === "weapon_grenade") return "G";
  if (type === "weapon_bazooka") return "B";
  return "?";
}

export class Pickup {
  id: string;
  x: number;
  y: number;
  type: string;

  private scene: Phaser.Scene;
  private gfx: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private lockLabel: Phaser.GameObjects.Text | null = null;
  private phase: number;
  private baseY: number;
  locked = false;

  constructor(scene: Phaser.Scene, id: string, x: number, y: number, type: string) {
    this.scene = scene;
    this.id = id;
    this.x = x;
    this.y = y;
    this.baseY = y;
    this.type = type;
    this.phase = Math.random() * Math.PI * 2;

    const color = getPickupColor(type);

    this.gfx = scene.add.graphics().setDepth(7);
    this.drawIcon(color, 0);

    this.label = scene.add
      .text(x, y, getPickupLabel(type), {
        fontSize: "12px",
        color: "#fff",
        fontStyle: "bold",
        stroke: "#000",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(8);
  }

  private drawIcon(color: number, glowAlpha: number) {
    this.gfx.clear();
    // Glow ring (larger for cure)
    const glowExtra = this.type === "cure" ? 6 : 4;
    if (glowAlpha > 0) {
      this.gfx.fillStyle(color, glowAlpha * 0.3);
      this.gfx.fillCircle(this.x, this.y, ICON_RADIUS + glowExtra);
    }
    // Main circle
    this.gfx.fillStyle(color, 0.85);
    this.gfx.fillCircle(this.x, this.y, ICON_RADIUS);
    this.gfx.lineStyle(1, 0xffffff, 0.4);
    this.gfx.strokeCircle(this.x, this.y, ICON_RADIUS);

    // White cross for cure type
    if (this.type === "cure") {
      this.gfx.fillStyle(0xffffff, 0.9);
      this.gfx.fillRect(this.x - 2, this.y - 7, 4, 14);
      this.gfx.fillRect(this.x - 7, this.y - 2, 14, 4);
    }
  }

  setLocked(locked: boolean) {
    if (this.locked === locked) return;
    this.locked = locked;
    if (locked && !this.lockLabel) {
      this.lockLabel = this.scene.add
        .text(this.x + ICON_RADIUS - 2, this.y - ICON_RADIUS + 2, "\uD83D\uDD12", {
          fontSize: "10px",
        })
        .setOrigin(0.5)
        .setDepth(9);
    }
    if (!locked && this.lockLabel) {
      this.lockLabel.destroy();
      this.lockLabel = null;
    }
  }

  update(dt: number) {
    this.phase += dt * BOB_FREQ;
    const bobOffset = Math.sin(this.phase) * BOB_AMP;
    this.y = this.baseY + bobOffset;

    const baseColor = getPickupColor(this.type);
    const color = this.locked ? 0x666666 : baseColor;
    const glowAlpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(this.phase * (GLOW_FREQ / BOB_FREQ)));
    this.drawIcon(color, this.locked ? 0 : glowAlpha);
    this.label.setPosition(this.x, this.y);
    this.lockLabel?.setPosition(this.x + ICON_RADIUS - 2, this.y - ICON_RADIUS + 2);
  }

  destroy() {
    this.gfx.destroy();
    this.label.destroy();
    this.lockLabel?.destroy();
  }
}
