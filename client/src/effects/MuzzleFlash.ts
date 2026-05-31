import Phaser from "phaser";

const FLASH_DURATION = 80;

export class MuzzleFlash {
  private gfx: Phaser.GameObjects.Graphics;
  private timer: Phaser.Time.TimerEvent;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.gfx = scene.add.graphics().setDepth(16);
    this.gfx.fillStyle(0xffdd44, 0.9);
    this.gfx.fillCircle(x, y, 12);
    this.gfx.fillStyle(0xffffff, 0.7);
    this.gfx.fillCircle(x, y, 6);

    this.timer = scene.time.delayedCall(FLASH_DURATION, () => {
      this.gfx.destroy();
    });
  }
}
