import Phaser from "phaser";
import type { PlayerRank } from "@patriot/shared";
import { RANK_STARS, PLAYER_RADIUS, INTERPOLATION_DELAY_MS, RANKS, RANK_TINTS } from "@patriot/shared";
import type { RankId } from "@patriot/shared";

const HP_BAR_W = 50;
const HP_BAR_H = 6;
const BOB_FREQ = 0.012;
const BOB_AMP = 2;

interface PosSnapshot {
  timestamp: number;
  x: number;
  y: number;
  aimAngle: number;
}

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

  // Interpolation buffer (remote players only)
  private interpBuffer: PosSnapshot[] = [];

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

    if (scene.textures.exists("soldier_patriot")) {
      const spr = scene.physics.add.sprite(x, y, "soldier_patriot");
      spr.setOrigin(0.5, 0.5);
      spr.setScale(0.06);
      spr.setDepth(10);
      this.sprite = spr;
      this.usingPlaceholder = false;
    } else {
      const rect = scene.add.rectangle(x, y, 48, 48, isLocal ? 0x556b2f : 0x8b4513);
      rect.setDepth(10);
      scene.physics.add.existing(rect);
      this.sprite = rect as any;
      this.usingPlaceholder = true;
    }

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setCircle(PLAYER_RADIUS);
    if (!this.usingPlaceholder) {
      const sw = (this.sprite as Phaser.Physics.Arcade.Sprite).displayWidth;
      const sh = (this.sprite as Phaser.Physics.Arcade.Sprite).displayHeight;
      body.setOffset(sw / 0.06 / 2 - PLAYER_RADIUS, sh / 0.06 / 2 - PLAYER_RADIUS);
    } else {
      body.setOffset(24 - PLAYER_RADIUS, 24 - PLAYER_RADIUS);
    }
    body.setCollideWorldBounds(true);
    body.setBounce(0, 0);

    // Remote players don't need physics simulation — they're interpolated
    if (!isLocal) {
      body.setImmovable(true);
      body.moves = false;
    }

    const stars = "\u2605".repeat(RANK_STARS[this.rank]);
    this.nameLabel = scene.add
      .text(x, y - 50, `${name} ${stars}`, {
        fontSize: "14px",
        color: isLocal ? "#fff" : "#ccc",
        stroke: "#000",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(20);

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
    const rankDef = RANKS.find((r) => r.id === rank);
    if (!rankDef) return;

    // Update star display
    const stars = "\u2605".repeat(rankDef.stars);
    this.nameLabel.setText(`${this.name} ${stars}`);

    // Sprite swap (with fallback)
    if (!this.usingPlaceholder) {
      let spriteKey = rankDef.spriteKey;
      if (!this.scene.textures.exists(spriteKey)) {
        spriteKey = "soldier_patriot";
      }
      (this.sprite as Phaser.Physics.Arcade.Sprite).setTexture(spriteKey);
    }

    // Rank tint
    const tint = RANK_TINTS[rank as RankId];
    if (tint && !this.isDowned) {
      (this.sprite as any).setTint?.(tint);
    } else if (!tint && !this.isDowned) {
      (this.sprite as any).clearTint?.();
    }
  }

  /** Apply downed visual state */
  setDowned(downed: boolean) {
    this.isDowned = downed;
    if (downed) {
      this.sprite.rotation = this.aimAngle + Math.PI;
      (this.sprite as any).setTint?.(0xff5555);
      this.nameLabel.setColor("#888");
      this.hpBarFg.width = 0;
    } else {
      (this.sprite as any).clearTint?.();
      this.nameLabel.setColor(this.isLocal ? "#fff" : "#ccc");
    }
  }

  /** Apply dead visual state */
  setDead(dead: boolean) {
    if (dead) {
      this.sprite.setAlpha(0.3);
      (this.sprite as any).setTint?.(0x666666);
      this.nameLabel.setVisible(false);
      this.hpBarBg.setVisible(false);
      this.hpBarFg.setVisible(false);
    }
  }

  /** Revive from dead/downed state (respawn at checkpoint) */
  revive() {
    this.isDowned = false;
    this.hp = 100;
    this.sprite.setAlpha(1);
    (this.sprite as any).clearTint?.();
    this.nameLabel.setVisible(true);
    this.nameLabel.setColor(this.isLocal ? "#fff" : "#ccc");
    this.hpBarBg.setVisible(true);
    this.hpBarFg.setVisible(true);
    this.setHp(100);
  }

  /** Brief red tint flash on hit */
  flashHit() {
    (this.sprite as any).setTint?.(0xff0000);
    this.scene.time.delayedCall(150, () => {
      if (this.isDowned) {
        (this.sprite as any).setTint?.(0xff5555);
      } else {
        (this.sprite as any).clearTint?.();
      }
    });
  }

  /** Set position directly (for server reconciliation) */
  setPosition(x: number, y: number) {
    this.sprite.setPosition(x, y);
    (this.sprite.body as Phaser.Physics.Arcade.Body).reset(x, y);
  }

  /** Push a server snapshot into the interpolation buffer (remote players) */
  pushSnapshot(x: number, y: number, aimAngle: number) {
    this.interpBuffer.push({ timestamp: Date.now(), x, y, aimAngle });
    // Keep buffer small
    if (this.interpBuffer.length > 10) {
      this.interpBuffer.shift();
    }
  }

  /** Interpolate remote player position from buffer */
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

    // Find bracketing snapshots
    for (let i = buf.length - 1; i >= 1; i--) {
      const prev = buf[i - 1];
      const next = buf[i];
      if (prev.timestamp <= renderTime && next.timestamp >= renderTime) {
        const range = next.timestamp - prev.timestamp;
        const t = range > 0 ? (renderTime - prev.timestamp) / range : 0;
        const ix = prev.x + (next.x - prev.x) * t;
        const iy = prev.y + (next.y - prev.y) * t;
        this.sprite.setPosition(ix, iy);
        this.setAimAngle(next.aimAngle);
        return;
      }
    }

    // Fallback: use latest
    const last = buf[buf.length - 1];
    this.sprite.setPosition(last.x, last.y);
    this.setAimAngle(last.aimAngle);
  }

  update(dt: number) {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;

    if (this.isLocal) {
      const speed = body.velocity.length();
      if (speed > 10) {
        this.bobPhase += dt * BOB_FREQ;
        this.bobOffset = Math.sin(this.bobPhase) * BOB_AMP;
      } else {
        this.bobOffset *= 0.85;
        if (Math.abs(this.bobOffset) < 0.1) this.bobOffset = 0;
      }
    } else {
      this.bobOffset = 0;
    }

    const sx = this.sprite.x;
    this.nameLabel.setPosition(sx, this.sprite.y - 50 + this.bobOffset);
    this.hpBarBg.setPosition(sx, this.sprite.y - 34 + this.bobOffset);
    this.hpBarFg.setPosition(
      sx - (HP_BAR_W - this.hpBarFg.width) / 2,
      this.sprite.y - 34 + this.bobOffset
    );
  }

  destroy() {
    this.sprite.destroy();
    this.nameLabel.destroy();
    this.hpBarBg.destroy();
    this.hpBarFg.destroy();
  }
}
