import Phaser from "phaser";
import { WEAPONS } from "@patriot/shared";
import type { WeaponId } from "@patriot/shared";

export class Bullet {
  id: string;
  weaponId: string;
  private gfx: Phaser.GameObjects.Arc;
  private outline: Phaser.GameObjects.Arc | null = null;
  private isGrenade: boolean;

  constructor(scene: Phaser.Scene, id: string, x: number, y: number, weaponId: string) {
    this.id = id;
    this.weaponId = weaponId;
    this.isGrenade = weaponId === "grenade";
    const wep = WEAPONS[weaponId as WeaponId];
    const color = parseInt((wep?.projectileColor ?? "#FFD700").replace("#", ""), 16);
    const radius = wep?.bulletRadius ?? 4;

    if (this.isGrenade) {
      // Darker outline ring for grenade
      this.outline = scene.add.circle(x, y, radius + 2, 0x2a3a1a).setDepth(15);
      this.gfx = scene.add.circle(x, y, radius, color).setDepth(16);
    } else {
      this.gfx = scene.add.circle(x, y, radius, color).setDepth(15);
    }
  }

  setPosition(x: number, y: number) {
    this.gfx.setPosition(x, y);
    if (this.isGrenade && this.outline) {
      this.outline.setPosition(x, y);
      // Spinning effect — rotate the outline scale for visual wobble
      const t = Date.now() / 100;
      const sx = 0.9 + 0.1 * Math.sin(t);
      const sy = 0.9 + 0.1 * Math.cos(t);
      this.outline.setScale(sx, sy);
    }
  }

  destroy() {
    this.gfx.destroy();
    this.outline?.destroy();
  }
}
