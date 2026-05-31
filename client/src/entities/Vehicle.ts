import Phaser from "phaser";
import { JEEP_HP, TRUCK_HP } from "@patriot/shared";

const HP_BAR_W = 50;
const HP_BAR_H = 5;

export class Vehicle {
  id: string;
  type: string;
  x: number;
  y: number;
  rotation: number;
  hp: number;
  maxHp: number;
  destroyed = false;
  driverId = "";

  private sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  private hpBarBg: Phaser.GameObjects.Rectangle;
  private hpBarFg: Phaser.GameObjects.Rectangle;
  private scene: Phaser.Scene;

  // Interpolation
  private snapshots: { x: number; y: number; rotation: number; t: number }[] = [];

  constructor(scene: Phaser.Scene, id: string, type: string, x: number, y: number, rotation: number) {
    this.scene = scene;
    this.id = id;
    this.type = type;
    this.x = x;
    this.y = y;
    this.rotation = rotation;
    this.maxHp = type === "jeep" ? JEEP_HP : type === "truck" ? TRUCK_HP : 120;
    this.hp = this.maxHp;

    const texKey = type === "jeep" ? "jeep_military" : type === "truck" ? "truck_military" : "tank_military";
    const sizeW = type === "truck" ? 70 : type === "tank" ? 65 : 55;
    const sizeH = type === "truck" ? 45 : type === "tank" ? 40 : 35;
    if (scene.textures.exists(texKey)) {
      this.sprite = scene.add
        .image(x, y, texKey)
        .setDisplaySize(sizeW + 5, sizeH + 5)
        .setDepth(10)
        .setRotation(rotation);
    } else {
      const color = type === "jeep" ? 0x4a7a3a : type === "truck" ? 0x6a6a4a : 0x5a5a5a;
      this.sprite = scene.add
        .rectangle(x, y, sizeW, sizeH, color)
        .setDepth(10)
        .setRotation(rotation);
    }

    this.hpBarBg = scene.add.rectangle(x, y - 35, HP_BAR_W, HP_BAR_H, 0x333333, 0.8).setDepth(20).setVisible(false);
    this.hpBarFg = scene.add.rectangle(x, y - 35, HP_BAR_W, HP_BAR_H, 0x44bb44, 1).setDepth(21).setVisible(false);
  }

  pushSnapshot(x: number, y: number, rotation: number) {
    this.snapshots.push({ x, y, rotation, t: Date.now() });
    if (this.snapshots.length > 5) this.snapshots.shift();
  }

  interpolate() {
    const now = Date.now() - 100;
    const snaps = this.snapshots;
    if (snaps.length < 2) {
      if (snaps.length === 1) {
        this.x = snaps[0].x;
        this.y = snaps[0].y;
        this.rotation = snaps[0].rotation;
      }
      this.updateVisuals();
      return;
    }

    let i = 0;
    while (i < snaps.length - 1 && snaps[i + 1].t < now) i++;
    if (i >= snaps.length - 1) {
      this.x = snaps[snaps.length - 1].x;
      this.y = snaps[snaps.length - 1].y;
      this.rotation = snaps[snaps.length - 1].rotation;
    } else {
      const a = snaps[i], b = snaps[i + 1];
      const t = (now - a.t) / (b.t - a.t);
      this.x = a.x + (b.x - a.x) * t;
      this.y = a.y + (b.y - a.y) * t;
      // Lerp angle
      let diff = b.rotation - a.rotation;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      this.rotation = a.rotation + diff * t;
    }
    this.updateVisuals();
  }

  private updateVisuals() {
    this.sprite.setPosition(this.x, this.y);
    this.sprite.setRotation(this.rotation);
    this.hpBarBg.setPosition(this.x, this.y - 35);
    this.hpBarFg.setPosition(this.x - HP_BAR_W / 2 + (HP_BAR_W * this.hp / this.maxHp) / 2, this.y - 35);
    this.hpBarFg.width = HP_BAR_W * Math.max(0, this.hp / this.maxHp);
  }

  setHp(hp: number) {
    this.hp = hp;
    const show = hp < this.maxHp && !this.destroyed;
    this.hpBarBg.setVisible(show);
    this.hpBarFg.setVisible(show);
    if (hp <= this.maxHp * 0.5) {
      this.hpBarFg.fillColor = hp <= this.maxHp * 0.25 ? 0xcc2222 : 0xccaa22;
    }
  }

  flashHit() {
    if ("setTint" in this.sprite) {
      (this.sprite as any).setTint(0xff4444);
      this.scene.time.delayedCall(100, () => (this.sprite as any).clearTint?.());
    }
  }

  setDestroyed() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.hpBarBg.setVisible(false);
    this.hpBarFg.setVisible(false);
    if ("setTint" in this.sprite) (this.sprite as any).setTint(0x333333);
    this.sprite.setAlpha(0.5);
  }

  destroy() {
    this.sprite.destroy();
    this.hpBarBg.destroy();
    this.hpBarFg.destroy();
  }
}
