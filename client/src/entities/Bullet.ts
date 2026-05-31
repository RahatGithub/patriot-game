import Phaser from "phaser";
import { WEAPONS } from "@patriot/shared";
import type { WeaponId } from "@patriot/shared";

export class Bullet {
  id: string;
  weaponId: string;
  private gfx: Phaser.GameObjects.Arc;
  private outline: Phaser.GameObjects.Arc | null = null;
  private glow: Phaser.GameObjects.Arc | null = null;
  private isGrenade: boolean;
  private isRocket: boolean;
  private scene: Phaser.Scene;
  private lastSmokeTime = 0;

  constructor(scene: Phaser.Scene, id: string, x: number, y: number, weaponId: string) {
    this.id = id;
    this.scene = scene;
    this.weaponId = weaponId;
    this.isGrenade = weaponId === "grenade";
    this.isRocket = weaponId === "bazooka" || weaponId === "tank_cannon";
    const wep = WEAPONS[weaponId as WeaponId];
    const color = parseInt((wep?.projectileColor ?? "#FFD700").replace("#", ""), 16);
    const radius = wep?.bulletRadius ?? 4;

    if (this.isGrenade) {
      this.outline = scene.add.circle(x, y, radius + 2, 0x2a3a1a).setDepth(15);
      this.gfx = scene.add.circle(x, y, radius, color).setDepth(16);
    } else if (this.isRocket) {
      // Rocket: larger with orange glow
      this.glow = scene.add.circle(x, y, radius + 4, 0xff6600, 0.3).setDepth(14);
      this.gfx = scene.add.circle(x, y, radius, color).setDepth(16);
      this.outline = scene.add.circle(x, y, radius + 1, 0xff4400, 0.6).setDepth(15);
    } else {
      this.gfx = scene.add.circle(x, y, radius, color).setDepth(15);
    }
  }

  setPosition(x: number, y: number) {
    this.gfx.setPosition(x, y);

    if (this.isGrenade && this.outline) {
      this.outline.setPosition(x, y);
      const t = Date.now() / 100;
      const sx = 0.9 + 0.1 * Math.sin(t);
      const sy = 0.9 + 0.1 * Math.cos(t);
      this.outline.setScale(sx, sy);
    }

    if (this.isRocket) {
      this.outline?.setPosition(x, y);
      this.glow?.setPosition(x, y);
      // Pulsing glow
      const t = Date.now() / 80;
      this.glow?.setScale(0.9 + 0.2 * Math.sin(t));

      // Smoke trail — spawn every ~50ms
      const now = Date.now();
      if (now - this.lastSmokeTime > 50) {
        this.lastSmokeTime = now;
        const smoke = this.scene.add
          .circle(x, y, Phaser.Math.Between(3, 5), 0x888888, 0.5)
          .setDepth(13);
        this.scene.tweens.add({
          targets: smoke,
          alpha: 0,
          scale: 1.5,
          duration: 400,
          onComplete: () => smoke.destroy(),
        });
      }
    }
  }

  destroy() {
    this.gfx.destroy();
    this.outline?.destroy();
    this.glow?.destroy();
  }
}
