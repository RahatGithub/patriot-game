import Phaser from "phaser";

export class BloodSplatter {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    for (let i = 0; i < 5; i++) {
      const dot = scene.add.circle(
        x + (Math.random() - 0.5) * 20,
        y + (Math.random() - 0.5) * 20,
        Phaser.Math.Between(2, 5),
        0xcc2222,
        0.8
      ).setDepth(14);

      scene.tweens.add({
        targets: dot,
        alpha: 0,
        x: dot.x + (Math.random() - 0.5) * 30,
        y: dot.y + (Math.random() - 0.5) * 30,
        duration: 400,
        onComplete: () => dot.destroy(),
      });
    }
  }
}
