import Phaser from "phaser";

const BARREL_SIZE = 50;

export class Barrel {
  id: string;
  x: number;
  y: number;
  exploded = false;

  private sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  private glow: Phaser.GameObjects.Arc;
  private scene: Phaser.Scene;
  private glowTween: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, id: string, x: number, y: number) {
    this.scene = scene;
    this.id = id;
    this.x = x;
    this.y = y;

    // Try to load barrel sprite, fall back to red rectangle
    if (scene.textures.exists("barrel_explosive")) {
      this.sprite = scene.add
        .image(x, y, "barrel_explosive")
        .setDisplaySize(BARREL_SIZE, BARREL_SIZE)
        .setDepth(8);
    } else {
      this.sprite = scene.add
        .rectangle(x, y, BARREL_SIZE * 0.7, BARREL_SIZE * 0.8, 0xcc2222)
        .setDepth(8);
    }

    // Subtle danger glow
    this.glow = scene.add
      .circle(x, y, BARREL_SIZE * 0.45, 0xff4400, 0.15)
      .setDepth(7);

    this.glowTween = scene.tweens.add({
      targets: this.glow,
      alpha: { from: 0.1, to: 0.25 },
      scale: { from: 0.9, to: 1.1 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  setExploded() {
    if (this.exploded) return;
    this.exploded = true;
    this.sprite.setVisible(false);
    this.glow.setVisible(false);
    this.glowTween.stop();
  }

  destroy() {
    this.glowTween.stop();
    this.sprite.destroy();
    this.glow.destroy();
  }
}
