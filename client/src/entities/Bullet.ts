import Phaser from "phaser";
import { WEAPONS } from "@patriot/shared";
import type { WeaponId } from "@patriot/shared";

export class Bullet {
  id: string;
  private gfx: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene, id: string, x: number, y: number, weaponId: string) {
    this.id = id;
    const wep = WEAPONS[weaponId as WeaponId];
    const color = parseInt((wep?.projectileColor ?? "#FFD700").replace("#", ""), 16);
    const radius = wep?.bulletRadius ?? 4;

    this.gfx = scene.add.circle(x, y, radius, color).setDepth(15);
  }

  setPosition(x: number, y: number) {
    this.gfx.setPosition(x, y);
  }

  destroy() {
    this.gfx.destroy();
  }
}
