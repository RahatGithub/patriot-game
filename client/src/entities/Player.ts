import Phaser from "phaser";
import type { PlayerRank } from "@patriot/shared";
import { RANK_STARS, PLAYER_RADIUS } from "@patriot/shared";

const HP_BAR_W = 50;
const HP_BAR_H = 6;
const BOB_FREQ = 0.012;
const BOB_AMP = 2;

export class Player {
  id: string;
  name: string;
  rank: PlayerRank = "soldier";
  hp = 100;
  aimAngle = 0;
  isLocal: boolean;
  isDowned = false;

  sprite: Phaser.Physics.Arcade.Sprite | Phaser.GameObjects.Rectangle;
  private nameLabel: Phaser.GameObjects.Text;
  private hpBarBg: Phaser.GameObjects.Rectangle;
  private hpBarFg: Phaser.GameObjects.Rectangle;
  private scene: Phaser.Scene;
  private bobPhase = 0;
  private bobOffset = 0;
  private usingPlaceholder: boolean;

  get x() {
    return this.sprite.x;
  }
  get y() {
    return this.sprite.y;
  }

  constructor(
    scene: Phaser.Scene,
    id: string,
    name: string,
    x: number,
    y: number,
    isLocal: boolean
  ) {
    this.scene = scene;
    this.id = id;
    this.name = name;
    this.isLocal = isLocal;

    // Create sprite or placeholder
    if (scene.textures.exists("soldier_patriot")) {
      const spr = scene.physics.add.sprite(x, y, "soldier_patriot");
      spr.setOrigin(0.5, 0.5);
      spr.setScale(0.06);
      spr.setDepth(10);
      this.sprite = spr;
      this.usingPlaceholder = false;
    } else {
      const rect = scene.add.rectangle(x, y, 48, 48, 0x556b2f);
      rect.setDepth(10);
      scene.physics.add.existing(rect);
      this.sprite = rect as any;
      this.usingPlaceholder = true;
    }

    // Physics body — circular
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setCircle(PLAYER_RADIUS);
    if (!this.usingPlaceholder) {
      // Center the circle body on the scaled sprite
      const sw = (this.sprite as Phaser.Physics.Arcade.Sprite).displayWidth;
      const sh = (this.sprite as Phaser.Physics.Arcade.Sprite).displayHeight;
      body.setOffset(sw / 0.06 / 2 - PLAYER_RADIUS, sh / 0.06 / 2 - PLAYER_RADIUS);
    } else {
      body.setOffset(24 - PLAYER_RADIUS, 24 - PLAYER_RADIUS);
    }
    body.setCollideWorldBounds(true);
    body.setBounce(0, 0);

    // Name label with stars
    const stars = "\u2605".repeat(RANK_STARS[this.rank]);
    this.nameLabel = scene.add
      .text(x, y - 50, `${name} ${stars}`, {
        fontSize: "14px",
        color: "#fff",
        stroke: "#000",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(20);

    // HP bar
    this.hpBarBg = scene.add
      .rectangle(x, y - 34, HP_BAR_W, HP_BAR_H, 0x333333)
      .setOrigin(0.5)
      .setDepth(20);
    this.hpBarFg = scene.add
      .rectangle(x, y - 34, HP_BAR_W, HP_BAR_H, 0x44bb44)
      .setOrigin(0.5)
      .setDepth(21);
  }

  setAimAngle(angle: number) {
    this.aimAngle = angle;
    // Sprite faces "up" by default → offset by +π/2
    this.sprite.rotation = angle + Math.PI / 2;
  }

  setHp(hp: number) {
    this.hp = Math.max(0, Math.min(100, hp));
    const ratio = this.hp / 100;
    this.hpBarFg.width = HP_BAR_W * ratio;
    this.hpBarFg.fillColor = ratio > 0.5 ? 0x44bb44 : ratio > 0.25 ? 0xddaa00 : 0xcc2222;
  }

  setRank(rank: PlayerRank) {
    this.rank = rank;
    const stars = "\u2605".repeat(RANK_STARS[rank]);
    this.nameLabel.setText(`${this.name} ${stars}`);
  }

  update(dt: number) {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    const speed = body.velocity.length();

    // Running bob
    if (speed > 10) {
      this.bobPhase += dt * BOB_FREQ;
      this.bobOffset = Math.sin(this.bobPhase) * BOB_AMP;
    } else {
      this.bobOffset *= 0.85; // smooth reset
      if (Math.abs(this.bobOffset) < 0.1) this.bobOffset = 0;
    }

    // Position overlays to follow sprite
    const sx = this.sprite.x;
    const sy = this.sprite.y + this.bobOffset;

    // Apply bob to visual only (not physics body)
    if (!this.usingPlaceholder) {
      (this.sprite as Phaser.Physics.Arcade.Sprite).y = body.center.y + this.bobOffset;
    }

    this.nameLabel.setPosition(sx, body.center.y - 50);
    this.hpBarBg.setPosition(sx, body.center.y - 34);
    this.hpBarFg.setPosition(
      sx - (HP_BAR_W - this.hpBarFg.width) / 2,
      body.center.y - 34
    );
  }

  destroy() {
    this.sprite.destroy();
    this.nameLabel.destroy();
    this.hpBarBg.destroy();
    this.hpBarFg.destroy();
  }
}
