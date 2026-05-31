import Phaser from "phaser";
import { PATRIOT_MAP, getRankForKills, getNextRank, RANKS } from "@patriot/shared";
import type { RankId } from "@patriot/shared";

const MINIMAP_W = 160;
const MINIMAP_H = 120; // 4:3 ratio matching 4000x3000 map
const MINIMAP_X = 15;
const MINIMAP_Y = 15;

export class HUDScene extends Phaser.Scene {
  private hpText!: Phaser.GameObjects.Text;
  private weaponText!: Phaser.GameObjects.Text;
  private rankText!: Phaser.GameObjects.Text;
  private minimapGfx!: Phaser.GameObjects.Graphics;
  private timerText!: Phaser.GameObjects.Text;
  private grenadeText!: Phaser.GameObjects.Text;
  private killsText!: Phaser.GameObjects.Text;
  private timerPulsePhase = 0;

  constructor() {
    super("HUDScene");
  }

  create() {
    this.cameras.main.setScroll(0, 0);

    const W = 1920;
    const H = 1080;

    // --- Top-left: mini-map ---
    this.add
      .rectangle(
        MINIMAP_X + MINIMAP_W / 2,
        MINIMAP_Y + MINIMAP_H / 2,
        MINIMAP_W,
        MINIMAP_H,
        0x000000,
        0.6
      )
      .setStrokeStyle(1, 0x555555);
    this.minimapGfx = this.add.graphics();

    // --- Top-center: timer ---
    this.timerText = this.add
      .text(W / 2, 30, "--:--", { fontSize: "28px", color: "#fff", fontStyle: "bold" })
      .setOrigin(0.5, 0);

    // --- Top-right: enemy counter ---
    this.add
      .text(W - 30, 30, "0/0", { fontSize: "20px", color: "#aaa" })
      .setOrigin(1, 0);

    // --- Bottom-left: HP + weapon ---
    this.add.rectangle(110, H - 50, 200, 60, 0x000000, 0.5).setStrokeStyle(1, 0x555555);
    this.hpText = this.add.text(20, H - 72, "HP: 100/100", {
      fontSize: "16px",
      color: "#4caf50",
    });
    this.weaponText = this.add.text(20, H - 45, "Pistol  30/\u221e", {
      fontSize: "13px",
      color: "#aaa",
    });
    this.grenadeText = this.add.text(170, H - 45, "", {
      fontSize: "13px",
      color: "#556b2f",
    });

    // HP bar
    this.add.rectangle(110, H - 28, 180, 8, 0x333333).setOrigin(0.5);
    this.add.rectangle(110, H - 28, 180, 8, 0x44bb44).setOrigin(0.5);

    // --- Bottom-right: rank + kills ---
    this.rankText = this.add
      .text(W - 30, H - 60, "Soldier \u2605", {
        fontSize: "16px",
        color: "#daa520",
      })
      .setOrigin(1, 0);
    this.killsText = this.add
      .text(W - 30, H - 35, "0 / 10 kills to Officer", {
        fontSize: "12px",
        color: "#888",
      })
      .setOrigin(1, 0);

    // --- Leave Match button (top-right) ---
    const leaveBtn = this.add
      .text(W - 20, 70, "\u2715 Leave", {
        fontSize: "16px",
        color: "#ff6666",
        backgroundColor: "rgba(0,0,0,0.6)",
        padding: { left: 10, right: 10, top: 5, bottom: 5 },
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });

    leaveBtn.on("pointerdown", () => {
      this.game.events.emit("leaveMatch");
    });

    // --- Ping display (bottom-right) ---
    const pingText = this.add
      .text(W - 30, H - 10, "Ping: --", {
        fontSize: "11px",
        color: "#4caf50",
      })
      .setOrigin(1, 1);

    // Periodic HUD update from game state
    this.time.addEvent({
      delay: 200,
      loop: true,
      callback: () => {
        const gameScene = this.scene.get("GameScene") as any;
        const nm = gameScene?.networkManager;
        if (!nm) return;

        // Ping
        const p = nm.ping;
        pingText.setText(`Ping: ${p}ms`);
        pingText.setColor(p < 80 ? "#4caf50" : p < 150 ? "#ddaa00" : "#cc2222");

        // Weapon + HP from player state
        const room = nm.getRoom();
        if (room) {
          const me = (room.state as any).players?.get(room.sessionId);
          if (me) {
            const hp = me.hp ?? 100;
            this.hpText.setText(`HP: ${hp}/100`);
            this.hpText.setColor(hp > 30 ? "#4caf50" : "#cc2222");

            const wepId = me.currentWeapon || "pistol";
            const wepNames: Record<string, string> = { pistol: "Pistol", mk18: "MK18", mg: "MG", bazooka: "Bazooka", grenade: "Grenade" };
            const wepName = wepNames[wepId] || wepId;
            const ammoStr = me.ammo != null && me.ammo > 0 ? `${me.ammo}` : "\u221e";
            this.weaponText.setText(`${wepName}  ${ammoStr}`);

            const gc = me.grenadeCount ?? 0;
            this.grenadeText.setText(gc > 0 ? `\uD83D\uDCA3\u00D7${gc}` : "");

            // Rank + kills progress
            const kills = me.kills ?? 0;
            const rankId = (me.rank || "soldier") as RankId;
            const rankDef = getRankForKills(kills);
            const stars = "\u2605".repeat(rankDef.stars);
            this.rankText.setText(`${rankDef.name.toUpperCase()} ${stars}`);
            const next = getNextRank(rankId);
            if (next) {
              this.killsText.setText(`${kills} / ${next.killThreshold} kills to ${next.name}`);
            } else {
              this.killsText.setText(`MAX RANK ${stars}`);
            }
          }

          // Mini-map update
          this.updateMinimap(room, me);
        }

        // Timer update
        const state = room.state as any;
        if (state.matchState === "in_progress" || state.matchState === "ended") {
          const ms = Math.max(0, state.timeRemainingMs ?? 0);
          const totalSec = Math.ceil(ms / 1000);
          const min = Math.floor(totalSec / 60);
          const sec = totalSec % 60;
          this.timerText.setText(
            `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
          );

          // Red pulse when < 30s
          if (ms > 0 && ms <= 30000) {
            this.timerPulsePhase += 0.2;
            const alpha = 0.5 + 0.5 * Math.sin(this.timerPulsePhase);
            this.timerText.setColor(
              `rgba(255, ${Math.floor(80 * alpha)}, ${Math.floor(80 * alpha)}, 1)`
            );
          } else if (ms <= 0) {
            this.timerText.setColor("#ff2222");
          } else {
            this.timerText.setColor("#ffffff");
            this.timerPulsePhase = 0;
          }
        }
      },
    });
  }

  private updateMinimap(room: any, localPlayer: any) {
    const gfx = this.minimapGfx;
    gfx.clear();

    const scaleX = MINIMAP_W / PATRIOT_MAP.width;
    const scaleY = MINIMAP_H / PATRIOT_MAP.height;

    // Draw checkpoint dots
    room.state.checkpoints?.forEach((cp: any) => {
      const dotX = MINIMAP_X + cp.x * scaleX;
      const dotY = MINIMAP_Y + cp.y * scaleY;
      const color = cp.captured ? 0x228b22 : 0xcc2222;
      gfx.fillStyle(color, 1);
      gfx.fillCircle(dotX, dotY, 4);
    });

    // Draw pickup dots (green for cure, white for others)
    room.state.pickups?.forEach((pk: any) => {
      const px = MINIMAP_X + pk.x * scaleX;
      const py = MINIMAP_Y + pk.y * scaleY;
      const color = pk.type === "cure" ? 0x44ff44 : 0xffffff;
      gfx.fillStyle(color, 0.8);
      gfx.fillCircle(px, py, 2);
    });

    // Draw local player dot
    if (localPlayer && !localPlayer.isDead) {
      const px = MINIMAP_X + localPlayer.x * scaleX;
      const py = MINIMAP_Y + localPlayer.y * scaleY;
      gfx.fillStyle(0x4488ff, 1);
      gfx.fillCircle(px, py, 3);
    }
  }
}
