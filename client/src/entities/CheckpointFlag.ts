import Phaser from "phaser";

const POLE_HEIGHT = 30;
const CLOTH_W = 25;
const CLOTH_H = 15;
const ENEMY_COLOR = 0xb22222;
const FRIENDLY_COLOR = 0x228b22;
const WAVE_SPEED = 0.004;
const WAVE_AMP = 2;

export class CheckpointFlag {
  private scene: Phaser.Scene;
  private poleGfx: Phaser.GameObjects.Graphics;
  private clothGfx: Phaser.GameObjects.Graphics;
  private x: number;
  private y: number;
  private color: number = ENEMY_COLOR;
  private wavePhase = Math.random() * Math.PI * 2;
  private transitioning = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.x = x;
    this.y = y;

    this.poleGfx = scene.add.graphics().setDepth(8);
    this.clothGfx = scene.add.graphics().setDepth(9);

    this.drawPole();
    this.drawCloth();
  }

  private drawPole() {
    this.poleGfx.clear();
    this.poleGfx.lineStyle(2, 0x888888, 1);
    this.poleGfx.moveTo(this.x, this.y);
    this.poleGfx.lineTo(this.x, this.y - POLE_HEIGHT);
    this.poleGfx.strokePath();
  }

  private drawCloth() {
    this.clothGfx.clear();
    const topY = this.y - POLE_HEIGHT;
    const wave = Math.sin(this.wavePhase) * WAVE_AMP;

    this.clothGfx.fillStyle(this.color, 1);
    this.clothGfx.beginPath();
    this.clothGfx.moveTo(this.x, topY);
    this.clothGfx.lineTo(this.x + CLOTH_W + wave, topY + CLOTH_H / 3);
    this.clothGfx.lineTo(this.x + CLOTH_W - wave, topY + (2 * CLOTH_H) / 3);
    this.clothGfx.lineTo(this.x, topY + CLOTH_H);
    this.clothGfx.closePath();
    this.clothGfx.fillPath();
  }

  update(dt: number) {
    this.wavePhase += dt * WAVE_SPEED;
    this.drawCloth();
  }

  capture() {
    if (this.transitioning) return;
    this.transitioning = true;

    // Tween the color from red to green over 1 second
    const startR = (ENEMY_COLOR >> 16) & 0xff;
    const startG = (ENEMY_COLOR >> 8) & 0xff;
    const startB = ENEMY_COLOR & 0xff;
    const endR = (FRIENDLY_COLOR >> 16) & 0xff;
    const endG = (FRIENDLY_COLOR >> 8) & 0xff;
    const endB = FRIENDLY_COLOR & 0xff;

    const tweenObj = { t: 0 };
    this.scene.tweens.add({
      targets: tweenObj,
      t: 1,
      duration: 1000,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        const r = Math.round(startR + (endR - startR) * tweenObj.t);
        const g = Math.round(startG + (endG - startG) * tweenObj.t);
        const b = Math.round(startB + (endB - startB) * tweenObj.t);
        this.color = (r << 16) | (g << 8) | b;
      },
      onComplete: () => {
        this.color = FRIENDLY_COLOR;
        this.transitioning = false;
      },
    });
  }

  get isCaptured() {
    return this.color === FRIENDLY_COLOR;
  }

  destroy() {
    this.poleGfx.destroy();
    this.clothGfx.destroy();
  }
}
