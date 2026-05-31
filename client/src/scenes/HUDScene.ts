import Phaser from "phaser";
import { PATRIOT_MAP, getRankForKills, getNextRank, RANKS, WEAPONS } from "@patriot/shared";
import type { RankId, WeaponId } from "@patriot/shared";
import { audioManager } from "../audio/AudioManager.js";

const MINIMAP_W = 200;
const MINIMAP_H = 150;
const MINIMAP_X = 12;
const MINIMAP_Y = 12;
const MINIMAP_SCALE_X = MINIMAP_W / PATRIOT_MAP.width;
const MINIMAP_SCALE_Y = MINIMAP_H / PATRIOT_MAP.height;
const FOG_RADIUS = 600;

const PANEL_BG = "rgba(20,24,20,0.75)";
const PANEL_BORDER = "#556B2F";
const FONT = "'Courier New', monospace";

export class HUDScene extends Phaser.Scene {
  private minimapGfx!: Phaser.GameObjects.Graphics;
  private timerPulsePhase = 0;
  private lastHp = 100;

  // DOM HUD
  private hudRoot: HTMLElement | null = null;
  private hpBarFg: HTMLElement | null = null;
  private hpNumEl: HTMLElement | null = null;
  private weaponNameEl: HTMLElement | null = null;
  private weaponAmmoEl: HTMLElement | null = null;
  private grenadeEl: HTMLElement | null = null;
  private rankNameEl: HTMLElement | null = null;
  private rankStarsEl: HTMLElement | null = null;
  private rankProgressBarEl: HTMLElement | null = null;
  private rankProgressTextEl: HTMLElement | null = null;
  private timerEl: HTMLElement | null = null;
  private enemyCountEl: HTMLElement | null = null;
  private pingEl: HTMLElement | null = null;
  private leaveBtn: HTMLElement | null = null;
  private vignetteEl: HTMLElement | null = null;

  constructor() {
    super("HUDScene");
  }

  create() {
    this.cameras.main.setScroll(0, 0);

    // --- Mini-map (Phaser graphics for pixel control) ---
    this.add
      .rectangle(MINIMAP_X + MINIMAP_W / 2, MINIMAP_Y + MINIMAP_H / 2, MINIMAP_W, MINIMAP_H, 0x141814, 0.75)
      .setStrokeStyle(1, 0x556b2f);
    this.minimapGfx = this.add.graphics();

    // Compass N indicator
    this.add
      .text(MINIMAP_X + MINIMAP_W / 2, MINIMAP_Y + 2, "N", { fontSize: "9px", color: "#aaa", fontFamily: FONT })
      .setOrigin(0.5, 0);

    // --- DOM HUD (responsive) ---
    this.createDomHud();

    // Vignette overlay for low HP
    this.vignetteEl = document.createElement("div");
    this.vignetteEl.id = "hud-vignette";
    this.vignetteEl.style.cssText = `
      position:fixed;inset:0;pointer-events:none;z-index:900;
      background:radial-gradient(ellipse at center,transparent 60%,rgba(180,0,0,0.3) 100%);
      opacity:0;transition:opacity 0.3s;
    `;
    document.body.appendChild(this.vignetteEl);

    // Periodic update
    this.time.addEvent({
      delay: 200,
      loop: true,
      callback: () => this.updateHud(),
    });

    this.events.on("shutdown", () => {
      this.hudRoot?.remove();
      this.vignetteEl?.remove();
    });
  }

  private createDomHud() {
    const existing = document.getElementById("hud-root");
    if (existing) existing.remove();

    const root = document.createElement("div");
    root.id = "hud-root";
    root.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:950;font-family:${FONT};`;

    // --- Timer (top center) ---
    root.innerHTML += `
      <div id="hud-timer" style="
        position:absolute;top:8px;left:50%;transform:translateX(-50%);
        background:${PANEL_BG};border:1px solid ${PANEL_BORDER};border-radius:6px;
        padding:4px 18px;text-align:center;
      ">
        <div id="hud-timer-val" style="font-size:clamp(20px,3vh,30px);color:#fff;font-weight:bold;letter-spacing:2px;">--:--</div>
      </div>
    `;

    // --- Enemy counter (top right) ---
    root.innerHTML += `
      <div style="
        position:absolute;top:8px;right:12px;
        background:${PANEL_BG};border:1px solid ${PANEL_BORDER};border-radius:6px;
        padding:6px 14px;text-align:center;min-width:100px;
      ">
        <div style="font-size:10px;color:#888;letter-spacing:1px;">ENEMIES</div>
        <div id="hud-enemy-count" style="font-size:clamp(16px,2.2vh,22px);color:#ff6644;font-weight:bold;">0 / 0</div>
      </div>
    `;

    // --- HP + Weapon (bottom left) ---
    root.innerHTML += `
      <div style="
        position:absolute;bottom:12px;left:12px;
        background:${PANEL_BG};border:1px solid ${PANEL_BORDER};border-radius:6px;
        padding:8px 14px;min-width:clamp(160px,18vw,240px);
      ">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <div style="font-size:11px;color:#888;">HP</div>
          <div id="hud-hp-num" style="font-size:clamp(14px,1.8vh,18px);color:#4caf50;font-weight:bold;">100</div>
        </div>
        <div style="background:#333;border-radius:3px;height:8px;width:100%;overflow:hidden;margin-bottom:6px;">
          <div id="hud-hp-bar" style="height:100%;width:100%;background:#4caf50;border-radius:3px;transition:width 0.15s,background 0.3s;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div id="hud-weapon-name" style="font-size:clamp(12px,1.5vh,16px);color:#ddd;font-weight:bold;">PISTOL</div>
            <div id="hud-weapon-ammo" style="font-size:clamp(11px,1.3vh,14px);color:#aaa;">\u221e</div>
          </div>
          <div id="hud-grenade" style="font-size:clamp(12px,1.5vh,16px);color:#556b2f;"></div>
        </div>
      </div>
    `;

    // --- Rank (bottom right) ---
    root.innerHTML += `
      <div id="hud-rank-panel" style="
        position:absolute;bottom:12px;right:12px;
        background:${PANEL_BG};border:1px solid ${PANEL_BORDER};border-radius:6px;
        padding:8px 14px;min-width:clamp(140px,16vw,220px);text-align:right;
      ">
        <div id="hud-rank-name" style="font-size:clamp(13px,1.6vh,17px);color:#daa520;font-weight:bold;">SOLDIER</div>
        <div id="hud-rank-stars" style="font-size:clamp(12px,1.4vh,16px);color:#daa520;letter-spacing:2px;">\u2605\u2606\u2606\u2606\u2606</div>
        <div style="background:#333;border-radius:3px;height:5px;width:100%;overflow:hidden;margin:4px 0 2px;">
          <div id="hud-rank-progress-bar" style="height:100%;width:0%;background:#daa520;border-radius:3px;transition:width 0.3s;"></div>
        </div>
        <div id="hud-rank-progress-text" style="font-size:clamp(9px,1.1vh,12px);color:#888;">0 / 10 to Officer</div>
      </div>
    `;

    // --- Ping (bottom right, below rank) ---
    root.innerHTML += `
      <div id="hud-ping" style="
        position:absolute;bottom:2px;right:14px;
        font-size:10px;color:#4caf50;
      ">Ping: --</div>
    `;

    // --- Leave match (top right, below enemy) ---
    root.innerHTML += `
      <div id="hud-leave" style="
        position:absolute;top:60px;right:12px;
        background:rgba(0,0,0,0.6);border:1px solid #663333;border-radius:4px;
        padding:3px 10px;font-size:12px;color:#ff6666;cursor:pointer;pointer-events:auto;
      ">\u2715 Leave</div>
    `;

    // --- Mute toggle (top right, below leave) ---
    root.innerHTML += `
      <div id="hud-mute" style="
        position:absolute;top:90px;right:12px;
        background:rgba(0,0,0,0.6);border:1px solid #555;border-radius:4px;
        padding:3px 10px;font-size:12px;color:#aaa;cursor:pointer;pointer-events:auto;
      ">${audioManager.isMuted ? "\uD83D\uDD07 Muted" : "\uD83D\uDD0A Sound"}</div>
    `;

    document.body.appendChild(root);
    this.hudRoot = root;

    // Cache refs
    this.timerEl = document.getElementById("hud-timer-val");
    this.enemyCountEl = document.getElementById("hud-enemy-count");
    this.hpBarFg = document.getElementById("hud-hp-bar");
    this.hpNumEl = document.getElementById("hud-hp-num");
    this.weaponNameEl = document.getElementById("hud-weapon-name");
    this.weaponAmmoEl = document.getElementById("hud-weapon-ammo");
    this.grenadeEl = document.getElementById("hud-grenade");
    this.rankNameEl = document.getElementById("hud-rank-name");
    this.rankStarsEl = document.getElementById("hud-rank-stars");
    this.rankProgressBarEl = document.getElementById("hud-rank-progress-bar");
    this.rankProgressTextEl = document.getElementById("hud-rank-progress-text");
    this.pingEl = document.getElementById("hud-ping");
    this.leaveBtn = document.getElementById("hud-leave");

    this.leaveBtn?.addEventListener("click", () => this.game.events.emit("leaveMatch"));

    const muteBtn = document.getElementById("hud-mute");
    muteBtn?.addEventListener("click", () => {
      const muted = audioManager.toggleMute();
      muteBtn.textContent = muted ? "\uD83D\uDD07 Muted" : "\uD83D\uDD0A Sound";
    });
  }

  private updateHud() {
    const gameScene = this.scene.get("GameScene") as any;
    const nm = gameScene?.networkManager;
    if (!nm) return;

    const room = nm.getRoom();
    if (!room) return;

    // Ping
    const p = nm.ping;
    if (this.pingEl) {
      this.pingEl.textContent = `Ping: ${p}ms`;
      this.pingEl.style.color = p < 80 ? "#4caf50" : p < 150 ? "#ddaa00" : "#cc2222";
    }

    const me = (room.state as any).players?.get(room.sessionId);
    if (me) {
      // HP
      const hp = me.hp ?? 100;
      const hpPct = Math.max(0, hp);
      if (this.hpBarFg) {
        this.hpBarFg.style.width = `${hpPct}%`;
        this.hpBarFg.style.background = hpPct > 60 ? "#4caf50" : hpPct > 30 ? "#ccaa22" : "#cc2222";
      }
      if (this.hpNumEl) {
        this.hpNumEl.textContent = `${hp}`;
        this.hpNumEl.style.color = hpPct > 30 ? "#4caf50" : "#cc2222";
        // Damage flash
        if (hp < this.lastHp) {
          this.hpNumEl.style.color = "#ffffff";
          setTimeout(() => { if (this.hpNumEl) this.hpNumEl.style.color = hpPct > 30 ? "#4caf50" : "#cc2222"; }, 150);
        }
      }
      // Low HP vignette
      if (this.vignetteEl) {
        this.vignetteEl.style.opacity = hp <= 20 && hp > 0 ? "1" : "0";
      }
      this.lastHp = hp;

      // Weapon
      const wepId = me.currentWeapon || "pistol";
      const wepDef = WEAPONS[wepId as WeaponId];
      const wepName = wepDef?.name || wepId.toUpperCase();
      if (this.weaponNameEl) this.weaponNameEl.textContent = wepName.toUpperCase();
      if (this.weaponAmmoEl) {
        if (wepDef?.ammo === "unlimited") {
          this.weaponAmmoEl.textContent = "\u221e";
          this.weaponAmmoEl.style.color = "#aaa";
        } else {
          const ammo = me.ammo ?? 0;
          const max = (wepDef?.ammo as number) ?? 3;
          this.weaponAmmoEl.textContent = `${ammo} / ${max}`;
          this.weaponAmmoEl.style.color = ammo <= 0 ? "#cc2222" : ammo <= 1 ? "#ccaa22" : "#aaa";
        }
      }

      // Grenades
      const gc = me.grenadeCount ?? 0;
      if (this.grenadeEl) {
        this.grenadeEl.textContent = gc > 0 ? `\uD83D\uDCA3\u00D7${gc}` : `\uD83D\uDCA3\u00D70`;
        this.grenadeEl.style.color = gc > 0 ? "#556b2f" : "#555";
      }

      // Rank
      const kills = me.kills ?? 0;
      const rankId = (me.rank || "soldier") as RankId;
      const rankDef = getRankForKills(kills);
      const filled = "\u2605".repeat(rankDef.stars);
      const empty = "\u2606".repeat(5 - rankDef.stars);
      if (this.rankNameEl) this.rankNameEl.textContent = rankDef.name.toUpperCase();
      if (this.rankStarsEl) this.rankStarsEl.textContent = filled + empty;
      const next = getNextRank(rankId);
      if (next) {
        const prevThreshold = rankDef.killThreshold;
        const progress = (kills - prevThreshold) / (next.killThreshold - prevThreshold);
        if (this.rankProgressBarEl) this.rankProgressBarEl.style.width = `${Math.min(100, progress * 100)}%`;
        if (this.rankProgressTextEl) this.rankProgressTextEl.textContent = `${kills} / ${next.killThreshold} to ${next.name}`;
      } else {
        if (this.rankProgressBarEl) this.rankProgressBarEl.style.width = "100%";
        if (this.rankProgressTextEl) this.rankProgressTextEl.textContent = "MAX RANK";
      }
    }

    // Timer
    const state = room.state as any;
    if (state.matchState === "in_progress" || state.matchState === "ended") {
      const ms = Math.max(0, state.timeRemainingMs ?? 0);
      const totalSec = Math.ceil(ms / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      const timeStr = `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
      if (this.timerEl) {
        this.timerEl.textContent = timeStr;
        if (ms > 0 && ms <= 10000) {
          this.timerPulsePhase += 0.5;
          const a = 0.5 + 0.5 * Math.sin(this.timerPulsePhase);
          this.timerEl.style.color = `rgb(255,${Math.floor(60 * a)},${Math.floor(60 * a)})`;
        } else if (ms > 0 && ms <= 60000) {
          this.timerPulsePhase += 0.2;
          const a = 0.5 + 0.5 * Math.sin(this.timerPulsePhase);
          this.timerEl.style.color = `rgb(255,${Math.floor(140 * a + 80)},${Math.floor(80 * a + 80)})`;
        } else if (ms <= 0) {
          this.timerEl.style.color = "#ff2222";
        } else {
          this.timerEl.style.color = "#ffffff";
          this.timerPulsePhase = 0;
        }
      }
    }

    // Enemy counter
    const totalKilled = state.totalAIKilled ?? 0;
    const totalSpawned = state.totalAISpawned ?? 0;
    const remaining = totalSpawned - totalKilled;
    if (this.enemyCountEl) {
      this.enemyCountEl.textContent = `${remaining} / ${totalSpawned}`;
    }

    // Minimap
    this.updateMinimap(room, me);
  }

  private updateMinimap(room: any, localPlayer: any) {
    const gfx = this.minimapGfx;
    gfx.clear();

    const mx = (wx: number) => MINIMAP_X + wx * MINIMAP_SCALE_X;
    const my = (wy: number) => MINIMAP_Y + wy * MINIMAP_SCALE_Y;

    // Zone outlines (subtle)
    for (const zone of PATRIOT_MAP.zones) {
      const zoneColor = zone.type === "outdoor" ? 0x3a5f3a : zone.type === "pool" ? 0x2a4a6a : zone.type === "indoor" ? 0x4a4a4a : 0x2a2a2a;
      gfx.fillStyle(zoneColor, 0.3);
      gfx.fillRect(mx(zone.bounds.x), my(zone.bounds.y), zone.bounds.width * MINIMAP_SCALE_X, zone.bounds.height * MINIMAP_SCALE_Y);
    }

    // Checkpoints
    let nextCpOrder = 999;
    room.state.checkpoints?.forEach((cp: any) => {
      if (!cp.captured && cp.order < nextCpOrder) nextCpOrder = cp.order;
    });
    room.state.checkpoints?.forEach((cp: any) => {
      const cx = mx(cp.x), cy = my(cp.y);
      if (cp.captured) {
        gfx.fillStyle(0x228b22, 1);
        gfx.fillCircle(cx, cy, 4);
      } else {
        gfx.fillStyle(0xcc2222, 1);
        gfx.fillCircle(cx, cy, 3);
        if (cp.order === nextCpOrder) {
          // Pulse ring for next checkpoint
          const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
          gfx.lineStyle(1, 0xffff00, pulse);
          gfx.strokeCircle(cx, cy, 6);
        }
      }
    });

    // Barrels
    room.state.barrels?.forEach((b: any) => {
      if (b.exploded) return;
      gfx.fillStyle(0xcc4422, 0.8);
      gfx.fillCircle(mx(b.x), my(b.y), 2);
    });

    // Pickups
    room.state.pickups?.forEach((pk: any) => {
      const color = pk.type === "cure" ? 0x44ff44 : 0xffaa44;
      gfx.fillStyle(color, 0.8);
      gfx.fillCircle(mx(pk.x), my(pk.y), 2);
    });

    // Vehicles
    room.state.vehicles?.forEach((v: any) => {
      if (v.destroyed) return;
      const vx = mx(v.x), vy = my(v.y);
      const sz = v.type === "tank" ? 5 : v.type === "truck" ? 4 : 3;
      gfx.fillStyle(0x999999, 0.9);
      gfx.fillRect(vx - sz / 2, vy - sz / 2, sz, sz);
    });

    // AI (fog-of-war: only within FOG_RADIUS of local player)
    if (localPlayer) {
      room.state.ai?.forEach((ai: any) => {
        if (ai.isDead) return;
        const dist = Math.hypot(ai.x - localPlayer.x, ai.y - localPlayer.y);
        if (dist > FOG_RADIUS) return;
        gfx.fillStyle(0xff4444, 0.9);
        gfx.fillCircle(mx(ai.x), my(ai.y), 2);
      });
    }

    // Teammates (blue dots)
    room.state.players?.forEach((p: any, sid: string) => {
      if (sid === room.sessionId) return;
      if (p.isDead) return;
      gfx.fillStyle(0x4488ff, 0.9);
      gfx.fillCircle(mx(p.x), my(p.y), 2.5);
    });

    // Local player (blue arrow)
    if (localPlayer && !localPlayer.isDead) {
      const px = mx(localPlayer.x), py = my(localPlayer.y);
      const angle = localPlayer.aimAngle ?? 0;
      const sz = 4;
      // Draw arrow
      gfx.fillStyle(0x66aaff, 1);
      gfx.fillTriangle(
        px + Math.cos(angle) * sz, py + Math.sin(angle) * sz,
        px + Math.cos(angle + 2.4) * sz, py + Math.sin(angle + 2.4) * sz,
        px + Math.cos(angle - 2.4) * sz, py + Math.sin(angle - 2.4) * sz
      );
    }
  }
}
