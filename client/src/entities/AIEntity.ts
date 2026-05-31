import Phaser from "phaser";
import { AI_RADIUS, INTERPOLATION_DELAY_MS } from "@patriot/shared";

const HP_BAR_W = 40;
const HP_BAR_H = 5;

interface PosSnapshot {
  timestamp: number;
  x: number;
  y: number;
  aimAngle: number;
}

export class AIEntity {
  id: string;
  sprite: Phaser.Physics.Arcade.Sprite | Phaser.GameObjects.Rectangle;
  private hpBarBg: Phaser.GameObjects.Rectangle;
  private hpBarFg: Phaser.GameObjects.Rectangle;
  private scene: Phaser.Scene;
  private interpBuffer: PosSnapshot[] = [];
  private usingPlaceholder: boolean;
  hp = 50;
  isDead = false;

  constructor(scene: Phaser.Scene, id: string, x: number, y: number, weapon: string) {
    this.scene = scene;
    this.id = id;

    // Try loading sprite — fallback to placeholder
    const texKey = `mafia_${weapon}`;
    if (scene.textures.exists(texKey)) {
      const spr = scene.physics.add.sprite(x, y, texKey);
      spr.setOrigin(0.5, 0.5).setScale(0.06).setDepth(9);
      this.sprite = spr;
      this.usingPlaceholder = false;
    } else {
      const rect = scene.add.rectangle(x, y, 44, 44, 0x222222);
      rect.setDepth(9);
      scene.physics.add.existing(rect);
      this.sprite = rect as any;
      this.usingPlaceholder = true;
    }

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setCircle(AI_RADIUS);
    if (!this.usingPlaceholder) {
      const sw = (this.sprite as Phaser.Physics.Arcade.Sprite).displayWidth;
      body.setOffset(sw / 0.06 / 2 - AI_RADIUS, sw / 0.06 / 2 - AI_RADIUS);
    } else {
      body.setOffset(22 - AI_RADIUS, 22 - AI_RADIUS);
    }
    body.setImmovable(true);
    body.moves = false;

    // Red HP bar (enemy)
    this.hpBarBg = scene.add.rectangle(x, y - 30, HP_BAR_W, HP_BAR_H, 0x333333).setOrigin(0.5).setDepth(19);
    this.hpBarFg = scene.add.rectangle(x, y - 30, HP_BAR_W, HP_BAR_H, 0xcc2222).setOrigin(0.5).setDepth(19);
  }

  setAimAngle(angle: number) {
    this.sprite.rotation = angle + Math.PI / 2;
  }

  setHp(hp: number) {
    this.hp = hp;
    const ratio = Math.max(0, hp) / 50;
    this.hpBarFg.width = HP_BAR_W * ratio;
  }

  setDead() {
    this.isDead = true;
    this.sprite.setAlpha(0.3);
    (this.sprite as any).setTint?.(0x666666);
    this.sprite.rotation = Math.PI / 2;
    this.hpBarBg.setVisible(false);
    this.hpBarFg.setVisible(false);
  }

  pushSnapshot(x: number, y: number, aimAngle: number) {
    this.interpBuffer.push({ timestamp: Date.now(), x, y, aimAngle });
    if (this.interpBuffer.length > 10) this.interpBuffer.shift();
  }

  interpolate() {
    const buf = this.interpBuffer;
    if (buf.length < 2) {
      if (buf.length === 1) {
        this.sprite.setPosition(buf[0].x, buf[0].y);
        this.setAimAngle(buf[0].aimAngle);
      }
      return;
    }
    const renderTime = Date.now() - INTERPOLATION_DELAY_MS;
    for (let i = buf.length - 1; i >= 1; i--) {
      const prev = buf[i - 1];
      const next = buf[i];
      if (prev.timestamp <= renderTime && next.timestamp >= renderTime) {
        const range = next.timestamp - prev.timestamp;
        const t = range > 0 ? (renderTime - prev.timestamp) / range : 0;
        this.sprite.setPosition(
          prev.x + (next.x - prev.x) * t,
          prev.y + (next.y - prev.y) * t
        );
        this.setAimAngle(next.aimAngle);
        return;
      }
    }
    const last = buf[buf.length - 1];
    this.sprite.setPosition(last.x, last.y);
    this.setAimAngle(last.aimAngle);
  }

  flashHit() {
    (this.sprite as any).setTint?.(0xff0000);
    this.scene.time.delayedCall(150, () => {
      if (!this.isDead) (this.sprite as any).clearTint?.();
    });
  }

  update() {
    // Follow sprite position for HP bars
    this.hpBarBg.setPosition(this.sprite.x, this.sprite.y - 30);
    this.hpBarFg.setPosition(
      this.sprite.x - (HP_BAR_W - this.hpBarFg.width) / 2,
      this.sprite.y - 30
    );
  }

  destroy() {
    this.sprite.destroy();
    this.hpBarBg.destroy();
    this.hpBarFg.destroy();
  }
}
