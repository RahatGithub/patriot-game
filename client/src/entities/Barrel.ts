import Phaser from "phaser";
import { BARREL_CARRY_OFFSET_Y } from "@patriot/shared";

const BARREL_SIZE = 50;

export class Barrel {
  id: string;
  x: number;
  y: number;
  exploded = false;
  carriedBy = "";

  private sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  private glow: Phaser.GameObjects.Arc;
  private scene: Phaser.Scene;
  private glowTween: Phaser.Tweens.Tween;
  private bobTime = 0;

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

  /** Update position — called from GameScene with carrier position or server state */
  setPosition(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.sprite.setPosition(x, y);
    this.glow.setPosition(x, y);
  }

  /** Set carried state and adjust rendering */
  setCarried(carrierId: string) {
    if (this.carriedBy === carrierId) return;
    this.carriedBy = carrierId;
    if (carrierId) {
      // Carried: render above player, higher depth
      this.sprite.setDepth(22);
      this.glow.setVisible(false);
    } else {
      // Dropped: restore normal depth
      this.sprite.setDepth(8);
      this.glow.setVisible(true);
    }
  }

  /** Update for carried bobbing — call each frame with delta */
  update(dt: number) {
    if (this.carriedBy) {
      this.bobTime += dt;
      const bob = Math.sin(this.bobTime / 200) * 2;
      this.sprite.setPosition(this.x, this.y + bob);
    }
  }

  /** Play drop animation: quick scale bounce + dust puff */
  playDrop() {
    // Scale bounce
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: 1.1,
      scaleY: 1.1,
      duration: 80,
      yoyo: true,
    });

    // Dust puff particles
    for (let i = 0; i < 5; i++) {
      const puff = this.scene.add
        .circle(
          this.x + (Math.random() - 0.5) * 20,
          this.y + (Math.random() - 0.5) * 10,
          Phaser.Math.Between(3, 6),
          0x999977,
          0.5
        )
        .setDepth(7);

      this.scene.tweens.add({
        targets: puff,
        x: puff.x + (Math.random() - 0.5) * 30,
        y: puff.y - 10 - Math.random() * 15,
        alpha: 0,
        scale: 0.3,
        duration: 300 + Math.random() * 200,
        onComplete: () => puff.destroy(),
      });
    }
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
