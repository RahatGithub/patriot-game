import Phaser from "phaser";
import { CRATE_HP } from "@patriot/shared";

const CRATE_SIZE = 50;
const HP_BAR_W = 40;
const HP_BAR_H = 4;

export class Crate {
  id: string;
  x: number;
  y: number;
  hp: number = CRATE_HP;
  destroyed = false;

  private sprite: Phaser.GameObjects.Rectangle;
  private hpBarBg: Phaser.GameObjects.Rectangle;
  private hpBarFg: Phaser.GameObjects.Rectangle;
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, id: string, x: number, y: number) {
    this.scene = scene;
    this.id = id;
    this.x = x;
    this.y = y;

    // Brown rectangle placeholder (replace with sprite when available)
    this.sprite = scene.add
      .rectangle(x, y, CRATE_SIZE, CRATE_SIZE, 0x8b6914)
      .setStrokeStyle(2, 0x5a4510)
      .setDepth(5);

    // Cross-plank detail
    const gfx = scene.add.graphics().setDepth(6);
    gfx.lineStyle(2, 0x5a4510, 0.6);
    gfx.moveTo(x - CRATE_SIZE / 2, y - CRATE_SIZE / 2);
    gfx.lineTo(x + CRATE_SIZE / 2, y + CRATE_SIZE / 2);
    gfx.moveTo(x + CRATE_SIZE / 2, y - CRATE_SIZE / 2);
    gfx.lineTo(x - CRATE_SIZE / 2, y + CRATE_SIZE / 2);
    gfx.strokePath();
    (this as any)._detailGfx = gfx;

    // HP bar (hidden until damaged)
    this.hpBarBg = scene.add
      .rectangle(x, y - CRATE_SIZE / 2 - 8, HP_BAR_W, HP_BAR_H, 0x333333)
      .setOrigin(0.5)
      .setDepth(20)
      .setVisible(false);
    this.hpBarFg = scene.add
      .rectangle(x, y - CRATE_SIZE / 2 - 8, HP_BAR_W, HP_BAR_H, 0xddaa00)
      .setOrigin(0.5)
      .setDepth(21)
      .setVisible(false);
  }

  setHp(hp: number) {
    this.hp = hp;
    if (hp < CRATE_HP) {
      this.hpBarBg.setVisible(true);
      this.hpBarFg.setVisible(true);
      const ratio = Math.max(0, hp / CRATE_HP);
      this.hpBarFg.width = HP_BAR_W * ratio;
    }
  }

  flashHit() {
    this.sprite.fillColor = 0xffcc44;
    this.scene.time.delayedCall(100, () => {
      if (!this.destroyed) this.sprite.fillColor = 0x8b6914;
    });

    // Wood chip particles
    for (let i = 0; i < 4; i++) {
      const chip = this.scene.add
        .rectangle(
          this.x + (Math.random() - 0.5) * 20,
          this.y + (Math.random() - 0.5) * 20,
          4, 4, 0x8b6914
        )
        .setDepth(30);
      this.scene.tweens.add({
        targets: chip,
        x: chip.x + (Math.random() - 0.5) * 60,
        y: chip.y + (Math.random() - 0.5) * 60,
        alpha: 0,
        duration: 400,
        onComplete: () => chip.destroy(),
      });
    }
  }

  playDestruction() {
    this.destroyed = true;

    // Larger splinter explosion
    for (let i = 0; i < 10; i++) {
      const size = 3 + Math.random() * 5;
      const splinter = this.scene.add
        .rectangle(
          this.x + (Math.random() - 0.5) * 10,
          this.y + (Math.random() - 0.5) * 10,
          size, size, 0x8b6914
        )
        .setDepth(30);
      this.scene.tweens.add({
        targets: splinter,
        x: splinter.x + (Math.random() - 0.5) * 100,
        y: splinter.y + (Math.random() - 0.5) * 100,
        alpha: 0,
        angle: Math.random() * 360,
        duration: 500 + Math.random() * 300,
        onComplete: () => splinter.destroy(),
      });
    }

    this.sprite.setVisible(false);
    (this as any)._detailGfx?.setVisible(false);
    this.hpBarBg.setVisible(false);
    this.hpBarFg.setVisible(false);
  }

  destroy() {
    this.sprite.destroy();
    (this as any)._detailGfx?.destroy();
    this.hpBarBg.destroy();
    this.hpBarFg.destroy();
  }
}
