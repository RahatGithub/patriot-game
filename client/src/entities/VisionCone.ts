import Phaser from "phaser";

const CONE_SEGMENTS = 16;

export class VisionCone {
  private graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(-1); // behind sprites
  }

  update(
    x: number,
    y: number,
    aimAngle: number,
    range: number,
    arc: number,
    state: string
  ) {
    const color = this.colorForState(state);
    const alpha = 0.2;

    this.graphics.clear();
    this.graphics.fillStyle(color, alpha);
    this.graphics.lineStyle(1, color, 0.4);

    const halfArc = arc / 2;
    const startAngle = aimAngle - halfArc;
    const endAngle = aimAngle + halfArc;

    this.graphics.beginPath();
    this.graphics.moveTo(x, y);
    for (let i = 0; i <= CONE_SEGMENTS; i++) {
      const t = i / CONE_SEGMENTS;
      const angle = startAngle + (endAngle - startAngle) * t;
      this.graphics.lineTo(x + Math.cos(angle) * range, y + Math.sin(angle) * range);
    }
    this.graphics.closePath();
    this.graphics.fillPath();
    this.graphics.strokePath();
  }

  private colorForState(state: string): number {
    switch (state) {
      case "patrol":
        return 0xffd700; // yellow
      case "alert":
        return 0xff8c00; // orange
      case "chase":
        return 0xff0000; // red
      default:
        return 0xffd700;
    }
  }

  setVisible(visible: boolean) {
    this.graphics.setVisible(visible);
  }

  destroy() {
    this.graphics.destroy();
  }
}
