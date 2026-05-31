import Phaser from "phaser";

export class Explosion {
  constructor(scene: Phaser.Scene, x: number, y: number, radius: number) {
    // Stage 1: bright flash expanding circle (0-100ms)
    const flash = scene.add.graphics().setDepth(30);
    const flashDuration = 100;

    // White-hot center
    const centerFlash = scene.add
      .circle(x, y, 10, 0xffffff, 0.9)
      .setDepth(31);

    scene.tweens.add({
      targets: centerFlash,
      scale: radius / 30,
      alpha: 0,
      duration: 200,
      onComplete: () => centerFlash.destroy(),
    });

    // Orange expanding ring
    let elapsed = 0;
    const flashTimer = scene.time.addEvent({
      delay: 16,
      repeat: Math.ceil(flashDuration / 16),
      callback: () => {
        elapsed += 16;
        const progress = Math.min(1, elapsed / flashDuration);
        const curRadius = radius * progress;

        flash.clear();
        // Outer orange glow
        flash.fillStyle(0xff6600, 0.6 * (1 - progress));
        flash.fillCircle(x, y, curRadius);
        // Inner yellow core
        flash.fillStyle(0xffcc00, 0.8 * (1 - progress));
        flash.fillCircle(x, y, curRadius * 0.5);
      },
    });

    // Clean up flash after Stage 1
    scene.time.delayedCall(flashDuration + 50, () => {
      flash.destroy();
    });

    // Stage 2: smoke particles (100-400ms)
    const particleCount = 10;
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5;
      const dist = radius * (0.3 + Math.random() * 0.7);
      const tx = x + Math.cos(angle) * dist;
      const ty = y + Math.sin(angle) * dist;
      const size = Phaser.Math.Between(6, 14);

      const smoke = scene.add
        .circle(x, y, size, 0x555555, 0.7)
        .setDepth(29);

      scene.tweens.add({
        targets: smoke,
        x: tx,
        y: ty,
        alpha: 0,
        scale: { from: 0.5, to: 1.5 },
        duration: 400 + Math.random() * 300,
        delay: 50 + Math.random() * 100,
        ease: "Quad.easeOut",
        onComplete: () => smoke.destroy(),
      });
    }

    // Debris sparks
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 120;
      const spark = scene.add
        .circle(x, y, Phaser.Math.Between(2, 4), 0xffaa22, 0.9)
        .setDepth(31);

      scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        duration: 300 + Math.random() * 200,
        ease: "Quad.easeOut",
        onComplete: () => spark.destroy(),
      });
    }
  }
}
