import Phaser from "phaser";
import {
  PATRIOT_MAP,
  PLAYER_RUN_SPEED,
  PLAYER_RADIUS,
  RECONCILIATION_THRESHOLD,
  WEAPONS,
} from "@patriot/shared";
import type { InputCommand, WeaponId } from "@patriot/shared";
import { InputManager } from "../input/InputManager.js";
import { InputDebugOverlay } from "../ui/InputDebugOverlay.js";
import { getDebugFlag } from "../utils/settings.js";
import type { DeviceProfile } from "../utils/deviceProfile.js";
import { Player } from "../entities/Player.js";
import { Bullet } from "../entities/Bullet.js";
import { MuzzleFlash } from "../effects/MuzzleFlash.js";
import type { NetworkManager } from "../network/NetworkManager.js";
import { checkWallCollisionClient } from "../systems/collisionClient.js";
import { BloodSplatter } from "../effects/BloodSplatter.js";
import { AIEntity } from "../entities/AIEntity.js";
import { CheckpointFlag } from "../entities/CheckpointFlag.js";
import { Crate } from "../entities/Crate.js";
import { Barrel } from "../entities/Barrel.js";
import { Vehicle } from "../entities/Vehicle.js";
import { Pickup } from "../entities/Pickup.js";
import { Explosion } from "../effects/Explosion.js";
import { getStateCallbacks } from "colyseus.js";
import { PickupPromptUI } from "../ui/PickupPromptUI.js";
import { PICKUP_INTERACT_RANGE, canUseWeapon, REVIVE_RANGE, BARREL_PICKUP_RANGE, BARREL_CARRY_OFFSET_Y, VEHICLE_INTERACT_RANGE } from "@patriot/shared";
import type { RankId, WeaponId } from "@patriot/shared";

const FREE_CAM_SPEED = 600;

export class GameScene extends Phaser.Scene {
  wallGroup!: Phaser.Physics.Arcade.StaticGroup;
  inputManager!: InputManager;
  localPlayer: Player | null = null;
  remotePlayers = new Map<string, Player>();

  private gridGfx: Phaser.GameObjects.Graphics | null = null;
  private gridTexts: Phaser.GameObjects.Text[] = [];
  private gridVisible = false;
  private cpIndex = 0;
  private debugOverlay: InputDebugOverlay | null = null;
  private deviceProfile: DeviceProfile = "desktop";
  private freeCam = false;
  private freeCamKeys!: Record<string, Phaser.Input.Keyboard.Key>;
  private networkManager: NetworkManager | null = null;
  private bullets = new Map<string, Bullet>();
  private aiEntities = new Map<string, AIEntity>();
  private lastFireTime = 0;
  private sessionId = "";
  private stateSetup = false;

  // Checkpoint rendering
  private checkpointZoneGfx: Phaser.GameObjects.Graphics | null = null;
  private checkpointFlags = new Map<string, CheckpointFlag>();
  private checkpointLabels = new Map<string, Phaser.GameObjects.Text>();
  private capturedSet = new Set<string>();

  // Capture progress UI (screen-space, added to HUD camera)
  private captureBarBg: Phaser.GameObjects.Rectangle | null = null;
  private captureBarFg: Phaser.GameObjects.Rectangle | null = null;
  private captureBarLabel: Phaser.GameObjects.Text | null = null;
  private captureNotification: Phaser.GameObjects.Text | null = null;
  private respawnNotification: Phaser.GameObjects.Text | null = null;
  private waveNotification: Phaser.GameObjects.Text | null = null;
  private localPlayerWasDead = false;
  private matchEnded = false;
  private lastWaveCount = 0;
  private debugFrameCount = 0;

  // Crates + Pickups
  private crateEntities = new Map<string, Crate>();
  private pickupEntities = new Map<string, Pickup>();
  private pickupPrompt = new PickupPromptUI();
  private reviveBarGfx: Phaser.GameObjects.Graphics | null = null;
  private revivePromptEl: HTMLElement | null = null;

  // Barrels
  private barrelEntities = new Map<string, Barrel>();
  private showAoEDebug = false;
  private barrelCarryHud: HTMLElement | null = null;
  private barrelPromptEl: HTMLElement | null = null;

  // Vehicles
  private vehicleEntities = new Map<string, Vehicle>();
  private vehiclePromptEl: HTMLElement | null = null;
  private vehicleHud: HTMLElement | null = null;

  constructor() {
    super("GameScene");
  }

  init(data: any) {
    this.deviceProfile = data?.deviceProfile || "desktop";
    this.networkManager = data?.networkManager || null;
  }

  preload() {
    const rankSprites = ["soldier_patriot", "officer_patriot", "major_patriot", "general_patriot", "marshal_patriot"];
    for (const key of rankSprites) {
      this.load.image(key, `/assets/sprites/characters/${key}.png`);
    }
    this.load.image("barrel_explosive", "/assets/sprites/objects/barrel2_patriot.png");
    this.load.image("mafia_mk18", "/assets/sprites/characters/mafia_mk18.png");
    this.load.image("mafia_pistol", "/assets/sprites/characters/mafia_pistol.png");
    this.load.image("mafia_mg", "/assets/sprites/characters/mafia_mg.png");
    this.load.on("loaderror", (file: any) => {
      console.warn(`[GameScene] Asset not found: ${file.key} — using placeholder`);
    });
  }

  create() {
    const map = PATRIOT_MAP;
    this.physics.world.setBounds(0, 0, map.width, map.height);

    // Reset state for re-entry
    this.localPlayer = null;
    this.remotePlayers.clear();
    this.stateSetup = false;

    // --- Render zones ---
    const zoneGfx = this.add.graphics();
    for (const zone of map.zones) {
      const b = zone.bounds;
      zoneGfx.fillStyle(parseInt(zone.floorColor.replace("#", ""), 16), 1);
      zoneGfx.fillRect(b.x, b.y, b.width, b.height);
    }

    // --- Render water ---
    const waterGfx = this.add.graphics();
    waterGfx.fillStyle(0x2a6a8a, 0.8);
    for (const pool of map.waterPools) {
      waterGfx.fillRect(pool.x, pool.y, pool.width, pool.height);
    }

    // --- Render walls ---
    this.wallGroup = this.physics.add.staticGroup();
    for (const wall of map.walls) {
      const rect = this.add.rectangle(
        wall.x + wall.width / 2,
        wall.y + wall.height / 2,
        wall.width,
        wall.height,
        0x1a1a1a
      );
      this.wallGroup.add(rect);
    }

    // --- Checkpoint zone graphics (redrawn dynamically from server state) ---
    this.checkpointZoneGfx = this.add.graphics().setDepth(1);

    // Revive progress bar (world-space, redrawn per frame)
    this.reviveBarGfx = this.add.graphics().setDepth(25);

    // --- Input manager ---
    this.inputManager = new InputManager();
    this.inputManager.init(this, this.deviceProfile);

    // --- Camera setup ---
    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.width, map.height);
    cam.setZoom(this.deviceProfile === "mobile" ? 0.8 : 1.0);
    const spawn = map.playerSpawn;
    cam.centerOn(spawn.x + spawn.width / 2, spawn.y + spawn.height / 2);

    // --- Debug keys ---
    const kb = this.input.keyboard!;
    this.freeCamKeys = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W, false),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A, false),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S, false),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D, false),
    };

    const tKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.T);
    tKey.on("down", () => {
      const cps = map.checkpoints;
      if (cps.length === 0) return;
      cam.centerOn(
        cps[this.cpIndex % cps.length].position.x,
        cps[this.cpIndex % cps.length].position.y
      );
      this.cpIndex++;
    });

    const f3Key = kb.addKey(Phaser.Input.Keyboard.KeyCodes.F3);
    kb.addCapture([Phaser.Input.Keyboard.KeyCodes.F3]);
    f3Key.on("down", () => this.toggleGrid());

    const f4Key = kb.addKey(Phaser.Input.Keyboard.KeyCodes.F4);
    kb.addCapture([Phaser.Input.Keyboard.KeyCodes.F4]);
    f4Key.on("down", () => {
      this.freeCam = !this.freeCam;
      if (this.freeCam) {
        cam.stopFollow();
      } else if (this.localPlayer) {
        cam.startFollow(this.localPlayer.sprite, true, 0.1, 0.1);
      }
    });

    const f5Key = kb.addKey(Phaser.Input.Keyboard.KeyCodes.F5);
    kb.addCapture([Phaser.Input.Keyboard.KeyCodes.F5]);
    f5Key.on("down", () => {
      if (!this.physics.world.debugGraphic) {
        this.physics.world.createDebugGraphic();
      } else {
        this.physics.world.debugGraphic.setVisible(
          !this.physics.world.debugGraphic.visible
        );
      }
    });

    const f9Key = kb.addKey(Phaser.Input.Keyboard.KeyCodes.F9);
    kb.addCapture([Phaser.Input.Keyboard.KeyCodes.F9]);
    f9Key.on("down", () => {
      this.showAoEDebug = !this.showAoEDebug;
      console.log(`[GameScene] AoE debug: ${this.showAoEDebug ? "ON" : "OFF"}`);
    });

    if (getDebugFlag("input")) {
      this.debugOverlay = new InputDebugOverlay(this.inputManager);
    }

    // --- Multiplayer state sync ---
    this.setupNetworking();

    // --- Capture progress bar (fixed to camera, screen-space) ---
    this.captureBarBg = this.add
      .rectangle(0, 0, 300, 24, 0x000000, 0.7)
      .setScrollFactor(0)
      .setDepth(100)
      .setVisible(false);
    this.captureBarFg = this.add
      .rectangle(0, 0, 0, 20, 0x44bb44, 1)
      .setScrollFactor(0)
      .setDepth(101)
      .setVisible(false);
    this.captureBarLabel = this.add
      .text(0, 0, "", { fontSize: "14px", color: "#fff", stroke: "#000", strokeThickness: 2 })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(102)
      .setVisible(false);

    // Capture celebration text
    this.captureNotification = this.add
      .text(0, 0, "CHECKPOINT CAPTURED!", {
        fontSize: "36px",
        color: "#00ff00",
        fontStyle: "bold",
        stroke: "#000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200)
      .setVisible(false);

    // Respawn notification
    this.respawnNotification = this.add
      .text(0, 0, "", {
        fontSize: "22px",
        color: "#44ddff",
        fontStyle: "bold",
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200)
      .setVisible(false);

    // Wave notification
    this.waveNotification = this.add
      .text(0, 0, "", {
        fontSize: "30px",
        color: "#ff8844",
        fontStyle: "bold",
        stroke: "#000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200)
      .setVisible(false);

    // Cleanup
    this.events.on("shutdown", () => {
      this.inputManager?.destroy();
      this.localPlayer?.destroy();
      this.remotePlayers.forEach((p) => p.destroy());
      this.remotePlayers.clear();
      this.bullets.forEach((b) => b.destroy());
      this.bullets.clear();
      this.aiEntities.forEach((a) => a.destroy());
      this.aiEntities.clear();
      this.checkpointFlags.forEach((f) => f.destroy());
      this.checkpointFlags.clear();
      this.checkpointLabels.forEach((l) => l.destroy());
      this.checkpointLabels.clear();
      this.capturedSet.clear();
      this.crateEntities.forEach((c) => c.destroy());
      this.crateEntities.clear();
      this.barrelEntities.forEach((b) => b.destroy());
      this.barrelEntities.clear();
      this.barrelCarryHud?.remove();
      this.barrelCarryHud = null;
      this.barrelPromptEl?.remove();
      this.barrelPromptEl = null;
      this.vehicleEntities.forEach((v) => v.destroy());
      this.vehicleEntities.clear();
      this.vehiclePromptEl?.remove();
      this.vehiclePromptEl = null;
      this.vehicleHud?.remove();
      this.vehicleHud = null;
      this.pickupEntities.forEach((p) => p.destroy());
      this.pickupEntities.clear();
      this.pickupPrompt.hide();
      this.revivePromptEl?.remove();
      this.revivePromptEl = null;
      this.debugOverlay?.destroy();
      this.debugOverlay = null;
    });

    this.game.events.emit("gameSceneReady");
  }

  private setupNetworking() {
    const room = this.networkManager?.getRoom();
    if (!room) {
      console.warn("[GameScene] setupNetworking: no room found");
      return;
    }

    this.sessionId = room.sessionId;
    console.log(`[GameScene] Network setup complete, sessionId: ${this.sessionId}`);

    // Wait for state to sync, then set up player listeners
    const pollState = setInterval(() => {
      if (!(room.state as any).code) return;
      clearInterval(pollState);
      this.initPlayerSync(room);
    }, 50);
  }

  private initPlayerSync(room: any) {
    if (this.stateSetup) return;
    this.stateSetup = true;

    const $ = getStateCallbacks(room);

    // Process existing players
    room.state.players.forEach((p: any, sid: string) => {
      this.onPlayerAdd(p, sid);
    });

    // Listen for new players
    $(room.state).players.onAdd((p: any, sid: string) => {
      const isLocal = sid === this.sessionId;
      console.log(`[GameScene] onAdd fired for sessionId: ${sid}, isLocal: ${isLocal}, name: ${p.name}`);
      if (!this.remotePlayers.has(sid) && !isLocal) {
        this.onPlayerAdd(p, sid);
      }
    });

    // Listen for player removal
    $(room.state).players.onRemove((_p: any, sid: string) => {
      this.onPlayerRemove(sid);
    });

    // Listen for state changes — update remote players + reconcile local
    room.onStateChange(() => {
      let playerCount = 0;
      room.state.players.forEach(() => playerCount++);
      console.log(`[GameScene] State change: ${playerCount} players, my sessionId: ${this.sessionId}, remotePlayers.size: ${this.remotePlayers.size}`);
      room.state.players.forEach((p: any, sid: string) => {
        if (sid === this.sessionId) {
          this.reconcileLocal(p);
          if (this.localPlayer) {
            // Detect respawn: was dead, now alive
            if (!p.isDead && !p.isDowned && (this.localPlayer.isDowned || this.localPlayerWasDead)) {
              this.localPlayer.revive();
              this.localPlayer.setPosition(p.x, p.y);
              if (!this.freeCam) {
                this.cameras.main.startFollow(this.localPlayer.sprite, true, 0.1, 0.1);
              }
              this.showRespawnNotification();
              this.localPlayerWasDead = false;
            }
            this.localPlayer.setHp(p.hp);
            this.localPlayer.setRank(p.rank);
            if (p.isDowned && !this.localPlayer.isDowned) this.localPlayer.setDowned(true);
            if (p.isDead) {
              this.localPlayer.setDead(true);
              this.localPlayerWasDead = true;
            }
          }
        } else {
          const remote = this.remotePlayers.get(sid);
          if (remote) {
            // Detect respawn for remote players
            if (!p.isDead && !p.isDowned && remote.isDowned) {
              remote.revive();
            }
            remote.pushSnapshot(p.x, p.y, p.aimAngle);
            remote.setHp(p.hp);
            remote.setRank(p.rank);
            if (p.isDowned && !remote.isDowned) remote.setDowned(true);
            if (p.isDead) remote.setDead(true);
          }
        }
      });

      // Sync bullets
      room.state.bullets.forEach((b: any, id: string) => {
        let bv = this.bullets.get(id);
        if (!bv) {
          bv = new Bullet(this, id, b.x, b.y, b.weaponId);
          this.bullets.set(id, bv);
          // Muzzle flash for remote player's new bullet
          if (b.ownerId !== this.sessionId) {
            new MuzzleFlash(this, b.x, b.y);
          }
        } else {
          bv.setPosition(b.x, b.y);
        }
      });

      // Remove despawned bullets
      const serverIds = new Set<string>();
      room.state.bullets.forEach((_b: any, id: string) => serverIds.add(id));
      this.bullets.forEach((bv, id) => {
        if (!serverIds.has(id)) {
          bv.destroy();
          this.bullets.delete(id);
        }
      });

      // Sync AI
      room.state.ai.forEach((ai: any, id: string) => {
        const ent = this.aiEntities.get(id);
        if (ent) {
          ent.pushSnapshot(ai.x, ai.y, ai.aimAngle);
          ent.setHp(ai.hp);
          ent.setBehaviorState(ai.behaviorState);
          if (ai.isDead && !ent.isDead) ent.setDead();
        }
      });
    });

    // Bullet add/remove listeners
    $(room.state).bullets.onAdd((b: any, id: string) => {
      if (!this.bullets.has(id)) {
        const bv = new Bullet(this, id, b.x, b.y, b.weaponId);
        this.bullets.set(id, bv);
        if (b.ownerId !== this.sessionId) {
          new MuzzleFlash(this, b.x, b.y);
        }
      }
    });

    $(room.state).bullets.onRemove((_b: any, id: string) => {
      const bv = this.bullets.get(id);
      if (bv) {
        bv.destroy();
        this.bullets.delete(id);
      }
    });

    // Damage event — hit effects
    room.onMessage("damage", (data: any) => {
      const { targetId, x, y } = data;
      // Blood splatter at hit position
      new BloodSplatter(this, x, y);

      // Flash the hit player's sprite
      const target =
        targetId === this.sessionId
          ? this.localPlayer
          : this.remotePlayers.get(targetId);
      target?.flashHit();

      // Local player hit: screen flash + camera shake
      if (targetId === this.sessionId) {
        this.cameras.main.shake(100, 0.005);
      }
    });

    // Player downed event
    room.onMessage("playerDowned", (data: any) => {
      const { victimId } = data;
      const player =
        victimId === this.sessionId
          ? this.localPlayer
          : this.remotePlayers.get(victimId);
      player?.setDowned(true);
    });

    // Player died event
    room.onMessage("playerDied", (data: any) => {
      const { victimId } = data;
      const player =
        victimId === this.sessionId
          ? this.localPlayer
          : this.remotePlayers.get(victimId);
      player?.setDead(true);
    });

    // Also handle AI damage hit flash
    room.onMessage("damage", (data: any) => {
      const ai = this.aiEntities.get(data.targetId);
      if (ai) ai.flashHit();
    });

    // AI killed
    room.onMessage("aiKilled", (data: any) => {
      const ai = this.aiEntities.get(data.aiId);
      if (ai) {
        ai.setDead();
        new BloodSplatter(this, data.x, data.y);
      }
    });

    // --- AI entity sync ---
    $(room.state).ai.onAdd((ai: any, id: string) => {
      if (!this.aiEntities.has(id)) {
        const ent = new AIEntity(this, id, ai.x, ai.y, ai.weapon);
        this.aiEntities.set(id, ent);
      }
    });

    $(room.state).ai.onRemove((_ai: any, id: string) => {
      const ent = this.aiEntities.get(id);
      if (ent) {
        ent.destroy();
        this.aiEntities.delete(id);
      }
    });

    // --- Checkpoint sync ---
    $(room.state).checkpoints.onAdd((cp: any, id: string) => {
      if (!this.checkpointFlags.has(id)) {
        const flag = new CheckpointFlag(this, cp.x, cp.y);
        this.checkpointFlags.set(id, flag);
        const label = this.add
          .text(cp.x, cp.y - cp.radius - 16, `CP ${cp.order}`, {
            fontSize: "14px",
            color: "#ffff88",
            stroke: "#000",
            strokeThickness: 2,
          })
          .setOrigin(0.5)
          .setDepth(9);
        this.checkpointLabels.set(id, label);
        if (cp.captured) {
          flag.capture();
          this.capturedSet.add(id);
        }
      }
    });

    $(room.state).checkpoints.onRemove((_cp: any, id: string) => {
      this.checkpointFlags.get(id)?.destroy();
      this.checkpointFlags.delete(id);
      this.checkpointLabels.get(id)?.destroy();
      this.checkpointLabels.delete(id);
    });

    // Checkpoint captured event
    room.onMessage("checkpointCaptured", (data: any) => {
      const { checkpointId, order, stats } = data;

      // Trigger flag color transition
      this.checkpointFlags.get(checkpointId)?.capture();
      this.capturedSet.add(checkpointId);

      // Stats overlay + celebration
      this.showCaptureNotification(order);
      if (stats) this.showMidMatchStats(order, stats);
    });

    // Match ended
    room.onMessage("MATCH_ENDED", (data: any) => {
      this.matchEnded = true;
      this.game.events.emit("matchEnded", {
        result: data.result,
        finalStats: data.finalStats,
      });
    });

    // Wave detection: watch totalAISpawned changes for wave announcements
    let prevSpawned = 0;
    room.onStateChange(() => {
      const s = room.state as any;
      const spawned = s.totalAISpawned ?? 0;
      if (spawned > prevSpawned && prevSpawned > 0) {
        // A new wave happened — figure out wave number from capturedCount
        const waveNum = (s.capturedCount ?? 0) + 1;
        this.showWaveNotification(waveNum);
      }
      prevSpawned = spawned;
    });

    // --- Crate sync ---
    $(room.state).crates.onAdd((crate: any, id: string) => {
      if (!this.crateEntities.has(id)) {
        const ent = new Crate(this, id, crate.x, crate.y);
        this.crateEntities.set(id, ent);
      }
    });
    $(room.state).crates.onRemove((_c: any, id: string) => {
      const ent = this.crateEntities.get(id);
      if (ent) { ent.destroy(); this.crateEntities.delete(id); }
    });

    // Crate state updates (HP changes)
    room.onStateChange(() => {
      (room.state as any).crates?.forEach((c: any, id: string) => {
        const ent = this.crateEntities.get(id);
        if (ent && !ent.destroyed) {
          ent.setHp(c.hp);
          if (c.destroyed && !ent.destroyed) ent.playDestruction();
        }
      });
    });

    room.onMessage("crateHit", (data: any) => {
      const ent = this.crateEntities.get(data.crateId);
      if (ent) ent.flashHit();
    });
    room.onMessage("crateDestroyed", (data: any) => {
      const ent = this.crateEntities.get(data.crateId);
      if (ent && !ent.destroyed) ent.playDestruction();
    });

    // --- Barrel sync ---
    $(room.state).barrels.onAdd((barrel: any, id: string) => {
      if (!this.barrelEntities.has(id)) {
        const ent = new Barrel(this, id, barrel.x, barrel.y);
        this.barrelEntities.set(id, ent);
      }
    });
    $(room.state).barrels.onRemove((_b: any, id: string) => {
      const ent = this.barrelEntities.get(id);
      if (ent) { ent.destroy(); this.barrelEntities.delete(id); }
    });

    // Barrel state updates (exploded flag + carried state + position)
    room.onStateChange(() => {
      (room.state as any).barrels?.forEach((b: any, id: string) => {
        const ent = this.barrelEntities.get(id);
        if (!ent) return;
        if (!ent.exploded && b.exploded) ent.setExploded();
        ent.setCarried(b.carriedBy || "");

        if (b.carriedBy) {
          // For carried barrels, track carrier's interpolated position for smoothness
          const carrierPlayer = b.carriedBy === this.sessionId
            ? this.localPlayer
            : this.remotePlayers.get(b.carriedBy);
          if (carrierPlayer) {
            ent.setPosition(carrierPlayer.sprite.x, carrierPlayer.sprite.y + BARREL_CARRY_OFFSET_Y);
          } else {
            ent.setPosition(b.x, b.y);
          }
        } else if (!ent.exploded) {
          ent.setPosition(b.x, b.y);
        }
      });
    });

    // Barrel picked up / dropped events
    room.onMessage("barrelPickedUp", (data: any) => {
      if (data.playerId === this.sessionId) {
        this.showBarrelCarryHud();
      }
    });
    room.onMessage("barrelDropped", (data: any) => {
      const ent = this.barrelEntities.get(data.barrelId);
      if (ent) ent.playDrop();
      if (data.playerId === this.sessionId) {
        this.hideBarrelCarryHud();
      }
    });

    // --- Explosion event ---
    room.onMessage("explosion", (data: any) => {
      const { x, y, radius } = data;
      new Explosion(this, x, y, radius);

      // Screen shake if local player is nearby
      if (this.localPlayer) {
        const dx = this.localPlayer.sprite.x - x;
        const dy = this.localPlayer.sprite.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 300) {
          const intensity = 0.01 * (1 - dist / 300);
          this.cameras.main.shake(200, Math.max(0.005, intensity));
        }
      }

      // F9 debug: show AoE radius circle
      if (this.showAoEDebug) {
        const debugCircle = this.add.graphics().setDepth(50);
        debugCircle.lineStyle(2, 0xff0000, 0.5);
        debugCircle.strokeCircle(x, y, radius);
        debugCircle.fillStyle(0xff0000, 0.1);
        debugCircle.fillCircle(x, y, radius);
        this.time.delayedCall(500, () => debugCircle.destroy());
      }
    });

    // --- Vehicle sync ---
    $(room.state).vehicles.onAdd((v: any, id: string) => {
      if (!this.vehicleEntities.has(id)) {
        const ent = new Vehicle(this, id, v.type, v.x, v.y, v.rotation);
        this.vehicleEntities.set(id, ent);
      }
    });
    $(room.state).vehicles.onRemove((_v: any, id: string) => {
      const ent = this.vehicleEntities.get(id);
      if (ent) { ent.destroy(); this.vehicleEntities.delete(id); }
    });

    // Vehicle state updates
    room.onStateChange(() => {
      (room.state as any).vehicles?.forEach((v: any, id: string) => {
        const ent = this.vehicleEntities.get(id);
        if (!ent) return;
        ent.pushSnapshot(v.x, v.y, v.rotation);
        ent.setHp(v.hp);
        ent.driverId = v.driverId || "";
        if (v.destroyed && !ent.destroyed) ent.setDestroyed();
      });

      // Hide/show player sprites when in/out of vehicles
      (room.state as any).players?.forEach((p: any, sid: string) => {
        const player = sid === this.sessionId ? this.localPlayer : this.remotePlayers.get(sid);
        if (player) {
          player.sprite.setVisible(!p.inVehicleId);
        }
      });
    });

    room.onMessage("vehicleHit", (data: any) => {
      const ent = this.vehicleEntities.get(data.vehicleId);
      if (ent) ent.flashHit();
    });

    room.onMessage("vehicleEntered", (data: any) => {
      if (data.playerId === this.sessionId) {
        this.showVehicleHud();
      }
    });

    room.onMessage("vehicleExited", (data: any) => {
      if (data.playerId === this.sessionId) {
        this.hideVehicleHud();
      }
    });

    // Cure used effect
    room.onMessage("cureUsed", (data: any) => {
      const { playerId, x, y } = data;
      console.log(`[GameScene] Cure used by ${playerId}`);

      // Green sparkle particles at pickup location
      for (let i = 0; i < 5; i++) {
        const spark = this.add
          .circle(
            x + (Math.random() - 0.5) * 20,
            y + (Math.random() - 0.5) * 20,
            3, 0x44ff44
          )
          .setDepth(30);
        this.tweens.add({
          targets: spark,
          x: spark.x + (Math.random() - 0.5) * 50,
          y: spark.y - 20 - Math.random() * 30,
          alpha: 0,
          scale: 0.3,
          duration: 500 + Math.random() * 200,
          onComplete: () => spark.destroy(),
        });
      }

      // Green flash on the player sprite
      const player =
        playerId === this.sessionId
          ? this.localPlayer
          : this.remotePlayers.get(playerId);
      if (player) {
        (player.sprite as any).setTint?.(0x44ff44);
        this.time.delayedCall(200, () => (player.sprite as any).clearTint?.());
      }

      // Subtle green screen tint for local player
      if (playerId === this.sessionId) {
        this.cameras.main.flash(200, 50, 200, 50);
      }
    });

    // Weapon picked up effect
    room.onMessage("weaponPicked", (data: any) => {
      const { playerId, weaponId } = data;
      console.log(`[GameScene] Weapon picked: ${weaponId} by ${playerId}`);

      const player =
        playerId === this.sessionId
          ? this.localPlayer
          : this.remotePlayers.get(playerId);
      if (player) {
        (player.sprite as any).setTint?.(0xffaa44);
        this.time.delayedCall(200, () => (player.sprite as any).clearTint?.());
      }

      // Grenade notification for local player
      if (playerId === this.sessionId && weaponId === "grenade") {
        this.showWeaponNotification("Picked up 3 grenades!");
      } else if (playerId === this.sessionId) {
        const name = weaponId.charAt(0).toUpperCase() + weaponId.slice(1);
        this.showWeaponNotification(`Equipped ${name}`);
      }
    });

    // Pickup blocked by rank
    room.onMessage("pickupBlocked", (data: any) => {
      this.showWeaponNotification(`Requires ${data.requiredRank}`);
    });

    // Player promoted event
    room.onMessage("playerPromoted", (data: any) => {
      const { playerId, newRankName } = data;
      if (playerId === this.sessionId) {
        this.showPromotionNotification(newRankName);
      } else {
        // Teammate promoted — find their name
        const remote = this.remotePlayers.get(playerId);
        const pState = (room.state as any).players?.get(playerId);
        const name = pState?.name || "Teammate";
        this.showTeammatePromotion(name, newRankName);
      }
    });

    // --- Pickup sync ---
    $(room.state).pickups.onAdd((pk: any, id: string) => {
      if (!this.pickupEntities.has(id)) {
        const ent = new Pickup(this, id, pk.x, pk.y, pk.type);
        this.pickupEntities.set(id, ent);
      }
    });
    $(room.state).pickups.onRemove((_pk: any, id: string) => {
      const ent = this.pickupEntities.get(id);
      if (ent) { ent.destroy(); this.pickupEntities.delete(id); }
    });

    // --- Interact key (E) ---
    const eKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    let eHeldTimer = 0;
    eKey.on("down", () => {
      if (this.matchEnded) return;
      room.send("interact");
      eHeldTimer = 0;
    });
    eKey.on("up", () => {
      room.send("interactRelease");
    });

    // Send interactHeld every 100ms while E is held
    this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        if (eKey.isDown && !this.matchEnded) {
          room.send("interactHeld");
        }
      },
    });

    // Revive event
    room.onMessage("playerRevived", (data: any) => {
      const { playerId } = data;
      if (playerId === this.sessionId && this.localPlayer) {
        this.cameras.main.flash(300, 50, 200, 50);
        this.showWeaponNotification("You're back up!");
      }
    });

    // N key dismisses pickup prompt
    const nKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.N);
    nKey.on("down", () => this.pickupPrompt.hide());
  }

  private onPlayerAdd(p: any, sid: string) {
    const isLocal = sid === this.sessionId;

    if (isLocal && this.localPlayer) {
      console.log(`[GameScene] onPlayerAdd: skipping local player (already exists)`);
      return;
    }
    if (!isLocal && this.remotePlayers.has(sid)) {
      console.log(`[GameScene] onPlayerAdd: skipping remote ${sid} (already exists)`);
      return;
    }

    console.log(`[GameScene] Creating ${isLocal ? "local" : "remote"} player entity for: ${p.name} (${sid}) at (${p.x}, ${p.y})`);
    const player = new Player(this, sid, p.name, p.x, p.y, isLocal);
    this.physics.add.collider(player.sprite, this.wallGroup);

    if (isLocal) {
      this.localPlayer = player;
      if (!this.freeCam) {
        this.cameras.main.startFollow(player.sprite, true, 0.1, 0.1);
      }
    } else {
      this.remotePlayers.set(sid, player);
      console.log(`[GameScene] remotePlayers.size is now: ${this.remotePlayers.size}`);
    }
  }

  private onPlayerRemove(sid: string) {
    const remote = this.remotePlayers.get(sid);
    if (remote) {
      remote.destroy();
      this.remotePlayers.delete(sid);
    }
  }

  private reconcileLocal(serverPlayer: any) {
    if (!this.localPlayer || !this.networkManager) return;

    const lastSeq = serverPlayer.lastProcessedInput;
    this.networkManager.reconcile(lastSeq);

    const dx = serverPlayer.x - this.localPlayer.sprite.x;
    const dy = serverPlayer.y - this.localPlayer.sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > RECONCILIATION_THRESHOLD) {
      // Snap to server position and replay pending inputs
      let px = serverPlayer.x;
      let py = serverPlayer.y;

      for (const input of this.networkManager.pendingInputs) {
        const result = this.predictStep(px, py, input);
        px = result.x;
        py = result.y;
      }

      this.localPlayer.setPosition(px, py);
    }
  }

  /** Client-side prediction step matching server logic */
  private predictStep(
    x: number,
    y: number,
    input: InputCommand
  ): { x: number; y: number } {
    let mx = input.moveX;
    let my = input.moveY;
    const mag = Math.sqrt(mx * mx + my * my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }

    // Use fixed dt matching server tick
    const dt = 50; // TICK_INTERVAL_MS
    const step = PLAYER_RUN_SPEED * (dt / 1000);

    let nx = x + mx * step;
    if (checkWallCollisionClient(nx, y, PLAYER_RADIUS)) nx = x;

    let ny = y + my * step;
    if (checkWallCollisionClient(x, ny, PLAYER_RADIUS)) ny = y;

    // Clamp
    nx = Math.max(PLAYER_RADIUS, Math.min(PATRIOT_MAP.width - PLAYER_RADIUS, nx));
    ny = Math.max(PLAYER_RADIUS, Math.min(PATRIOT_MAP.height - PLAYER_RADIUS, ny));

    return { x: nx, y: ny };
  }

  update(_time: number, delta: number) {
    if (this.freeCam) {
      const cam = this.cameras.main;
      const spd = (FREE_CAM_SPEED * delta) / 1000;
      if (this.freeCamKeys.A.isDown) cam.scrollX -= spd;
      if (this.freeCamKeys.D.isDown) cam.scrollX += spd;
      if (this.freeCamKeys.W.isDown) cam.scrollY -= spd;
      if (this.freeCamKeys.S.isDown) cam.scrollY += spd;
    } else if (this.localPlayer && this.networkManager && !this.localPlayer.isDowned && !this.matchEnded) {
      const im = this.inputManager;
      const body = this.localPlayer.sprite.body as Phaser.Physics.Arcade.Body;

      // Apply movement via physics (Phaser handles wall collision)
      body.setVelocity(
        im.moveVector.x * PLAYER_RUN_SPEED,
        im.moveVector.y * PLAYER_RUN_SPEED
      );

      // Aim
      let angle: number;
      if (this.deviceProfile === "desktop") {
        const ptr = this.input.activePointer;
        angle = Math.atan2(
          ptr.worldY - this.localPlayer.sprite.y,
          ptr.worldX - this.localPlayer.sprite.x
        );
      } else {
        angle = im.aimAngle;
      }
      this.localPlayer.setAimAngle(angle);

      // Send input to server
      this.networkManager.sendInput(
        im.moveVector.x,
        im.moveVector.y,
        angle,
        im.fireHeld
      );

      // Fire weapon — semi fires on press, auto fires on hold
      const room = this.networkManager.getRoom();
      const curWeapon = (room?.state as any)?.players?.get(this.sessionId)?.currentWeapon || "pistol";
      const wep = WEAPONS[curWeapon as WeaponId] ?? WEAPONS.pistol;
      const shouldFire = wep.fireMode === "auto" ? im.fireHeld : im.firePressed;
      if (shouldFire) {
        const now = Date.now();
        const cooldown = 1000 / wep.fireRatePerSec;
        if (now - this.lastFireTime >= cooldown) {
          this.lastFireTime = now;
          room?.send("fire", { aimAngle: angle });
          const fx = this.localPlayer.sprite.x + Math.cos(angle) * 35;
          const fy = this.localPlayer.sprite.y + Math.sin(angle) * 35;
          new MuzzleFlash(this, fx, fy);

          // MG: subtle camera shake for heavy weapon feel
          if (curWeapon === "mg") {
            this.cameras.main.shake(50, 0.001);
          }
        }
      }

      // Throw grenade (G key) — separate from weapon slot
      if (im.grenadePressed && room) {
        room.send("throwGrenade");
      }

      // Drop weapon (F key) — revert to pistol
      if (im.dropPressed && room) {
        room.send("dropWeapon");
      }

      // Bazooka fire feedback — heavy screen shake + flash
      if (shouldFire && curWeapon === "bazooka" && Date.now() - this.lastFireTime < 100) {
        this.cameras.main.shake(150, 0.008);
        this.cameras.main.flash(80, 200, 100, 50);
      }
    }

    // Update all players
    this.localPlayer?.update(delta);
    this.remotePlayers.forEach((p) => {
      p.interpolate();
      p.update(delta);
    });
    this.debugFrameCount++;
    if (this.debugFrameCount % 60 === 0) {
      console.log(`[GameScene] Interpolating ${this.remotePlayers.size} remote players`);
    }

    // Update AI
    this.aiEntities.forEach((ai) => {
      ai.interpolate();
      ai.update();
    });

    // Update checkpoint flags (wave animation)
    this.checkpointFlags.forEach((flag) => flag.update(delta));

    // Update checkpoint zone visuals + capture progress bar
    this.updateCheckpoints();

    // Update pickups (bob animation) + proximity prompt
    this.pickupEntities.forEach((pk) => pk.update(delta));
    this.updatePickupPrompt();
    this.updateReviveUI();

    // Update barrel bob animation (for carried barrels)
    this.barrelEntities.forEach((b) => b.update(delta));
    this.updateBarrelPrompt();

    // Update vehicles
    this.vehicleEntities.forEach((v) => v.interpolate());
    this.updateVehiclePrompt();
  }

  private toggleGrid() {
    if (this.gridVisible) {
      this.gridGfx?.destroy();
      this.gridGfx = null;
      for (const t of this.gridTexts) t.destroy();
      this.gridTexts = [];
      this.gridVisible = false;
      return;
    }
    const map = PATRIOT_MAP;
    const gfx = this.add.graphics();
    gfx.lineStyle(1, 0xffffff, 0.1);
    gfx.setDepth(1000);
    for (let x = 0; x <= map.width; x += 100) {
      gfx.moveTo(x, 0);
      gfx.lineTo(x, map.height);
    }
    for (let y = 0; y <= map.height; y += 100) {
      gfx.moveTo(0, y);
      gfx.lineTo(map.width, y);
    }
    gfx.strokePath();
    this.gridGfx = gfx;
    for (let x = 0; x <= map.width; x += 500) {
      for (let y = 0; y <= map.height; y += 500) {
        this.gridTexts.push(
          this.add
            .text(x + 4, y + 2, `${x},${y}`, {
              fontSize: "10px",
              color: "rgba(255,255,255,0.3)",
            })
            .setDepth(1001)
        );
      }
    }
    this.gridVisible = true;
  }

  private updateCheckpoints() {
    const room = this.networkManager?.getRoom();
    if (!room) return;

    const gfx = this.checkpointZoneGfx;
    if (!gfx) return;

    gfx.clear();

    const cam = this.cameras.main;
    const screenCenterX = cam.width / 2;
    const barY = 80;

    let localInCpId: string | null = null;
    let localCpOrder = 0;
    let localCpProgress = 0;
    let localCpMafiaPresent = false;

    (room.state as any).checkpoints?.forEach((cp: any, id: string) => {
      // Draw zone circle
      const fillColor = cp.captured ? 0x228b22 : 0xffff00;
      const fillAlpha = cp.captured ? 0.15 : 0.15;
      const strokeColor = cp.captured ? 0x228b22 : 0xffff00;

      gfx.fillStyle(fillColor, fillAlpha);
      gfx.fillCircle(cp.x, cp.y, cp.radius);
      gfx.lineStyle(2, strokeColor, 0.4);
      gfx.strokeCircle(cp.x, cp.y, cp.radius);

      // Check if local player is inside this checkpoint
      if (this.localPlayer && !cp.captured) {
        const dx = this.localPlayer.sprite.x - cp.x;
        const dy = this.localPlayer.sprite.y - cp.y;
        if (dx * dx + dy * dy <= cp.radius * cp.radius) {
          localInCpId = id;
          localCpOrder = cp.order;
          localCpProgress = cp.captureProgress;
          // Check if mafia present by examining capturingPlayerIds vs progress behavior
          const ids = cp.capturingPlayerIds as string;
          const hasHumans = ids.length > 0;
          // If progress is not advancing and humans are present, mafia must be in zone
          localCpMafiaPresent = hasHumans && cp.captureProgress === this._lastCpProgress.get(id);
        }
      }

      // Track progress for mafia detection heuristic
      this._lastCpProgress.set(id, cp.captureProgress);
    });

    // Update capture progress bar
    if (localInCpId && this.captureBarBg && this.captureBarFg && this.captureBarLabel) {
      this.captureBarBg.setPosition(screenCenterX, barY).setVisible(true);
      const barWidth = 280 * localCpProgress;
      this.captureBarFg
        .setPosition(screenCenterX - 140 + barWidth / 2, barY)
        .setSize(barWidth, 20)
        .setVisible(true);

      if (localCpMafiaPresent && localCpProgress > 0 && localCpProgress < 1) {
        this.captureBarLabel.setText(`\u26A0 Enemies in zone — clear them!`);
        this.captureBarLabel.setColor("#ff4444");
        this.captureBarFg.fillColor = 0xcc2222;
      } else {
        this.captureBarLabel.setText(`Capturing Checkpoint ${localCpOrder}...`);
        this.captureBarLabel.setColor("#ffffff");
        this.captureBarFg.fillColor = 0x44bb44;
      }
      this.captureBarLabel.setPosition(screenCenterX, barY).setVisible(true);
    } else {
      this.captureBarBg?.setVisible(false);
      this.captureBarFg?.setVisible(false);

      // If not in any checkpoint but progress was decaying, show message briefly
      if (this.captureBarLabel) {
        // Check if any checkpoint has decaying progress
        let decaying = false;
        (room.state as any).checkpoints?.forEach((cp: any) => {
          if (!cp.captured && cp.captureProgress > 0 && cp.captureProgress < 1) {
            decaying = true;
          }
        });
        if (decaying) {
          this.captureBarBg?.setPosition(screenCenterX, barY).setVisible(true);
          this.captureBarLabel.setText("Capture lost \u2014 return to zone");
          this.captureBarLabel.setColor("#888888");
          this.captureBarLabel.setPosition(screenCenterX, barY).setVisible(true);
          this.captureBarFg?.setVisible(false);
        } else {
          this.captureBarLabel.setVisible(false);
        }
      }
    }
  }

  private _lastCpProgress = new Map<string, number>();

  private showCaptureNotification(order: number) {
    if (!this.captureNotification) return;
    const cam = this.cameras.main;
    this.captureNotification
      .setText(`CHECKPOINT ${order} CAPTURED!`)
      .setPosition(cam.width / 2, cam.height / 2 - 60)
      .setAlpha(1)
      .setVisible(true);

    // Brief screen flash
    this.cameras.main.flash(400, 100, 255, 100);

    // Fade out after 2s
    this.tweens.add({
      targets: this.captureNotification,
      alpha: 0,
      delay: 1500,
      duration: 500,
      onComplete: () => this.captureNotification?.setVisible(false),
    });
  }

  private showRespawnNotification() {
    if (!this.respawnNotification) return;
    const cam = this.cameras.main;

    // Find which checkpoint we respawned at (latest captured)
    const room = this.networkManager?.getRoom();
    let cpOrder = 0;
    if (room) {
      let latestCaptured: any = null;
      (room.state as any).checkpoints?.forEach((cp: any) => {
        if (cp.captured && (!latestCaptured || cp.capturedAt > latestCaptured.capturedAt)) {
          latestCaptured = cp;
        }
      });
      if (latestCaptured) cpOrder = latestCaptured.order;
    }

    this.respawnNotification
      .setText(cpOrder > 0 ? `Respawned at Checkpoint ${cpOrder}` : "Respawned!")
      .setPosition(cam.width / 2, 130)
      .setAlpha(1)
      .setVisible(true);

    this.tweens.add({
      targets: this.respawnNotification,
      alpha: 0,
      delay: 1500,
      duration: 500,
      onComplete: () => this.respawnNotification?.setVisible(false),
    });
  }

  private showMidMatchStats(order: number, stats: any) {
    // Remove existing overlay if present
    const existing = document.getElementById("midmatch-stats");
    if (existing) existing.remove();

    const totalMs = stats.timeRemainingMs ?? 0;
    const totalSec = Math.ceil(totalMs / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    const timeStr = `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;

    const players = (stats.players || []) as any[];
    const sorted = [...players].sort((a: any, b: any) => b.kills - a.kills || b.damageDealt - a.damageDealt);
    const mvpName = sorted.length > 0 ? sorted[0].name : "";

    let rows = "";
    for (const p of sorted) {
      const isMvp = p.name === mvpName && p.kills > 0;
      const crown = isMvp ? "\uD83D\uDC51 " : "";
      const style = isMvp ? 'style="color:#ffd700"' : "";
      rows += `<div class="midstats-row" ${style}>${crown}${p.name} — ${p.kills} kills</div>`;
    }

    const overlay = document.createElement("div");
    overlay.id = "midmatch-stats";
    overlay.innerHTML = `
      <div style="
        position:fixed; top:70px; left:50%; transform:translateX(-50%);
        background:rgba(0,0,0,0.85); border:1px solid #555; border-radius:8px;
        padding:14px 24px; color:#fff; font-family:monospace; z-index:1000;
        min-width:280px; max-width:420px; text-align:center;
        animation: fadeInStats 0.4s ease-out;
      ">
        <div style="font-size:11px; color:#aaa; margin-bottom:4px">
          Progress: ${stats.capturedSoFar}/${stats.totalCheckpoints} &nbsp;|&nbsp; Time left: ${timeStr}
        </div>
        <div style="border-top:1px solid #444; margin:8px 0; padding-top:8px; text-align:left; font-size:13px; line-height:1.6">
          ${rows}
        </div>
      </div>
    `;

    // Inject keyframes if not present
    if (!document.getElementById("midstats-style")) {
      const style = document.createElement("style");
      style.id = "midstats-style";
      style.textContent = `
        @keyframes fadeInStats { from { opacity:0; transform:translateX(-50%) translateY(-10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
        .midstats-row { padding: 2px 0; }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(overlay);

    // Auto-dismiss after 5s
    setTimeout(() => {
      overlay.style.transition = "opacity 0.5s";
      overlay.style.opacity = "0";
      setTimeout(() => overlay.remove(), 500);
    }, 5000);

    // Click to dismiss
    overlay.addEventListener("click", () => {
      overlay.style.transition = "opacity 0.3s";
      overlay.style.opacity = "0";
      setTimeout(() => overlay.remove(), 300);
    });
  }

  private showWaveNotification(waveNumber: number) {
    if (!this.waveNotification) return;
    const cam = this.cameras.main;
    this.waveNotification
      .setText(`WAVE ${waveNumber}!`)
      .setPosition(cam.width / 2, 120)
      .setAlpha(1)
      .setVisible(true);

    this.tweens.add({
      targets: this.waveNotification,
      alpha: 0,
      delay: 1500,
      duration: 500,
      onComplete: () => this.waveNotification?.setVisible(false),
    });
  }

  private updatePickupPrompt() {
    if (!this.localPlayer || this.matchEnded) {
      this.pickupPrompt.hide();
      return;
    }

    const cam = this.cameras.main;
    const room = this.networkManager?.getRoom();
    if (!room) { this.pickupPrompt.hide(); return; }

    const localState = (room.state as any).players?.get(this.sessionId);
    const playerRank = (localState?.rank || "soldier") as RankId;

    let closestPk: Pickup | null = null;
    let closestDist = PICKUP_INTERACT_RANGE;
    let closestType = "";
    let closestId = "";

    (room.state as any).pickups?.forEach((pk: any, id: string) => {
      if (pk.type === "cure") return; // Cure is auto-pickup, no prompt
      const ent = this.pickupEntities.get(id);
      if (!ent) return;

      // Update lock overlay for all weapon pickups
      if (pk.type.startsWith("weapon_")) {
        const wepId = pk.type.replace("weapon_", "") as WeaponId;
        ent.setLocked(!canUseWeapon(playerRank, wepId));
      }

      const dx = this.localPlayer!.sprite.x - pk.x;
      const dy = this.localPlayer!.sprite.y - pk.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closestPk = ent;
        closestType = pk.type;
        closestId = id;
      }
    });

    if (closestPk && closestType.startsWith("weapon_")) {
      const sx = (closestPk.x - cam.scrollX) * cam.zoom;
      const sy = (closestPk.y - cam.scrollY) * cam.zoom;
      this.pickupPrompt.show(closestId, closestType, sx, sy, playerRank);
    } else {
      this.pickupPrompt.hide();
    }
  }

  private showWeaponNotification(text: string) {
    if (!this.waveNotification) return;
    const cam = this.cameras.main;
    this.waveNotification
      .setText(text)
      .setPosition(cam.width / 2, 120)
      .setAlpha(1)
      .setColor("#ffaa44")
      .setVisible(true);

    this.tweens.add({
      targets: this.waveNotification,
      alpha: 0,
      delay: 1500,
      duration: 500,
      onComplete: () => this.waveNotification?.setVisible(false),
    });
  }

  private showPromotionNotification(rankName: string) {
    if (!this.captureNotification) return;
    const cam = this.cameras.main;
    this.captureNotification
      .setText(`PROMOTED TO ${rankName.toUpperCase()}!`)
      .setColor("#ffd700")
      .setPosition(cam.width / 2, cam.height / 2 - 60)
      .setAlpha(1)
      .setVisible(true);

    this.cameras.main.flash(400, 255, 215, 0);

    this.tweens.add({
      targets: this.captureNotification,
      alpha: 0,
      delay: 2500,
      duration: 500,
      onComplete: () => {
        this.captureNotification?.setVisible(false);
        this.captureNotification?.setColor("#00ff00");
      },
    });
  }

  private showTeammatePromotion(name: string, rankName: string) {
    // Small top-right notification
    const existing = document.getElementById("teammate-promo");
    if (existing) existing.remove();

    const el = document.createElement("div");
    el.id = "teammate-promo";
    el.style.cssText = `
      position:fixed; top:100px; right:20px;
      background:rgba(0,0,0,0.8); border:1px solid #ffd700; border-radius:6px;
      padding:8px 14px; color:#ffd700; font-family:monospace; font-size:13px;
      z-index:1000;
    `;
    el.textContent = `${name} promoted to ${rankName}!`;
    document.body.appendChild(el);

    setTimeout(() => {
      el.style.transition = "opacity 0.5s";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 500);
    }, 2000);
  }

  private showVehicleHud() {
    if (this.vehicleHud) return;
    const el = document.createElement("div");
    el.id = "vehicle-hud";
    el.style.cssText = `
      position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
      background:rgba(0,0,0,0.85); border:2px solid #4a7a3a; border-radius:6px;
      padding:6px 16px; color:#88cc66; font-family:monospace; font-size:13px;
      z-index:1000; pointer-events:none; white-space:nowrap;
    `;
    el.textContent = "DRIVING \u2014 Press E to exit";
    document.body.appendChild(el);
    this.vehicleHud = el;
  }

  private hideVehicleHud() {
    this.vehicleHud?.remove();
    this.vehicleHud = null;
  }

  private updateVehiclePrompt() {
    if (!this.localPlayer || this.matchEnded) {
      this.hideVehiclePrompt();
      return;
    }

    const room = this.networkManager?.getRoom();
    if (!room) { this.hideVehiclePrompt(); return; }

    const localState = (room.state as any).players?.get(this.sessionId);
    if (!localState || localState.isDowned || localState.isDead) { this.hideVehiclePrompt(); return; }
    if (localState.inVehicleId || localState.carriedBarrelId) { this.hideVehiclePrompt(); return; }

    let closestDist = VEHICLE_INTERACT_RANGE;
    let closestVehicle: any = null;
    (room.state as any).vehicles?.forEach((v: any) => {
      if (v.destroyed) return;
      // For trucks: allow boarding if not full
      const isFull = v.type === "jeep" ? !!v.driverId
        : v.type === "truck" ? (!!v.driverId && (v.passengerIds?.length ?? 0) >= 3)
        : !!v.driverId;
      if (isFull) return;
      const dx = this.localPlayer!.sprite.x - v.x;
      const dy = this.localPlayer!.sprite.y - v.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) { closestDist = dist; closestVehicle = v; }
    });

    if (closestVehicle) {
      const cam = this.cameras.main;
      const sx = (closestVehicle.x - cam.scrollX) * cam.zoom;
      const sy = (closestVehicle.y - cam.scrollY) * cam.zoom;
      const vType = closestVehicle.type?.charAt(0).toUpperCase() + closestVehicle.type?.slice(1);
      const hasDriver = !!closestVehicle.driverId;
      const label = hasDriver ? `Press E to ride along (${vType})` : `Press E to enter ${vType}`;
      if (!this.vehiclePromptEl) {
        const el = document.createElement("div");
        el.id = "vehicle-prompt";
        el.style.cssText = `
          position:fixed; transform:translateX(-50%);
          background:rgba(0,0,0,0.85); border:2px solid #4a7a3a; border-radius:6px;
          padding:4px 12px; color:#88cc66; font-family:monospace; font-size:11px;
          z-index:1000; pointer-events:none; white-space:nowrap;
        `;
        document.body.appendChild(el);
        this.vehiclePromptEl = el;
      }
      this.vehiclePromptEl.textContent = label;
      this.vehiclePromptEl.style.left = `${sx}px`;
      this.vehiclePromptEl.style.top = `${sy - 50}px`;
    } else {
      this.hideVehiclePrompt();
    }
  }

  private hideVehiclePrompt() {
    this.vehiclePromptEl?.remove();
    this.vehiclePromptEl = null;
  }

  private showBarrelCarryHud() {
    if (this.barrelCarryHud) return;
    const el = document.createElement("div");
    el.id = "barrel-carry-hud";
    el.style.cssText = `
      position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
      background:rgba(0,0,0,0.85); border:2px solid #cc4422; border-radius:6px;
      padding:6px 16px; color:#ff6644; font-family:monospace; font-size:13px;
      z-index:1000; pointer-events:none; white-space:nowrap;
    `;
    el.textContent = "\uD83D\uDEE2\uFE0F Carrying Barrel \u2014 Press E to drop";
    document.body.appendChild(el);
    this.barrelCarryHud = el;
  }

  private hideBarrelCarryHud() {
    this.barrelCarryHud?.remove();
    this.barrelCarryHud = null;
  }

  private updateBarrelPrompt() {
    if (!this.localPlayer || this.matchEnded) {
      this.hideBarrelPrompt();
      return;
    }

    const room = this.networkManager?.getRoom();
    if (!room) { this.hideBarrelPrompt(); return; }

    const localState = (room.state as any).players?.get(this.sessionId);
    if (!localState || localState.isDowned || localState.isDead) { this.hideBarrelPrompt(); return; }

    // If carrying, HUD already shows drop prompt — hide barrel pickup prompt
    if (localState.carriedBarrelId) {
      this.hideBarrelPrompt();
      return;
    }

    // Find nearest non-carried barrel within pickup range
    let closestDist = BARREL_PICKUP_RANGE;
    let closestBarrel: any = null;
    (room.state as any).barrels?.forEach((b: any) => {
      if (b.exploded || b.carriedBy) return;
      const dx = this.localPlayer!.sprite.x - b.x;
      const dy = this.localPlayer!.sprite.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closestBarrel = b;
      }
    });

    if (closestBarrel) {
      const cam = this.cameras.main;
      const sx = (closestBarrel.x - cam.scrollX) * cam.zoom;
      const sy = (closestBarrel.y - cam.scrollY) * cam.zoom;
      this.showBarrelPrompt(sx, sy);
    } else {
      this.hideBarrelPrompt();
    }
  }

  private showBarrelPrompt(sx: number, sy: number) {
    if (!this.barrelPromptEl) {
      const el = document.createElement("div");
      el.id = "barrel-prompt";
      el.style.cssText = `
        position:fixed; transform:translateX(-50%);
        background:rgba(0,0,0,0.85); border:2px solid #cc4422; border-radius:6px;
        padding:4px 12px; color:#ff6644; font-family:monospace; font-size:11px;
        z-index:1000; pointer-events:none; white-space:nowrap;
      `;
      el.textContent = "Press E to pick up Barrel";
      document.body.appendChild(el);
      this.barrelPromptEl = el;
    }
    this.barrelPromptEl.style.left = `${sx}px`;
    this.barrelPromptEl.style.top = `${sy - 50}px`;
  }

  private hideBarrelPrompt() {
    this.barrelPromptEl?.remove();
    this.barrelPromptEl = null;
  }

  private updateReviveUI() {
    const room = this.networkManager?.getRoom();
    if (!room || !this.reviveBarGfx) { this.hideRevivePrompt(); return; }

    this.reviveBarGfx.clear();

    const cam = this.cameras.main;
    let showingPrompt = false;

    // Draw revive progress bars above all downed players + show prompt for local player
    (room.state as any).players?.forEach((p: any, sid: string) => {
      if (!p.isDowned || p.isDead) return;
      if (sid === this.sessionId) return; // Don't show revive prompt for self

      const progress = p.reviveProgress ?? 0;

      // Draw progress bar in world space above downed player
      if (progress > 0) {
        const barW = 40;
        const barH = 5;
        const bx = p.x - barW / 2;
        const by = p.y - 55;
        this.reviveBarGfx!.fillStyle(0x333333, 0.8);
        this.reviveBarGfx!.fillRect(bx, by, barW, barH);
        this.reviveBarGfx!.fillStyle(0x44ff44, 1);
        this.reviveBarGfx!.fillRect(bx, by, barW * progress, barH);
      }

      // Show "Hold E to Revive" prompt for local player if nearby
      if (this.localPlayer && !this.localPlayer.isDowned) {
        const dx = this.localPlayer.sprite.x - p.x;
        const dy = this.localPlayer.sprite.y - p.y;
        if (dx * dx + dy * dy <= REVIVE_RANGE * REVIVE_RANGE) {
          const sx = (p.x - cam.scrollX) * cam.zoom;
          const sy = (p.y - cam.scrollY) * cam.zoom;
          this.showRevivePrompt(sx, sy, progress);
          showingPrompt = true;
        }
      }
    });

    if (!showingPrompt) this.hideRevivePrompt();

    // If local player is downed, draw their own progress
    if (this.localPlayer?.isDowned) {
      const me = (room.state as any).players?.get(this.sessionId);
      if (me && me.reviveProgress > 0) {
        const barW = 40;
        const barH = 5;
        const bx = me.x - barW / 2;
        const by = me.y - 55;
        this.reviveBarGfx.fillStyle(0x333333, 0.8);
        this.reviveBarGfx.fillRect(bx, by, barW, barH);
        this.reviveBarGfx.fillStyle(0x44ff44, 1);
        this.reviveBarGfx.fillRect(bx, by, barW * me.reviveProgress, barH);
      }
    }
  }

  private showRevivePrompt(sx: number, sy: number, progress: number) {
    if (!this.revivePromptEl) {
      const el = document.createElement("div");
      el.id = "revive-prompt";
      el.style.cssText = `
        position:fixed; transform:translateX(-50%);
        background:rgba(0,0,0,0.85); border:2px solid #44ff44; border-radius:6px;
        padding:6px 14px; color:#44ff44; font-family:monospace; font-size:12px;
        z-index:1000; text-align:center; pointer-events:none; white-space:nowrap;
      `;
      document.body.appendChild(el);
      this.revivePromptEl = el;
    }
    this.revivePromptEl.style.left = `${sx}px`;
    this.revivePromptEl.style.top = `${sy - 90}px`;
    this.revivePromptEl.textContent = progress > 0 ? `Reviving... ${Math.floor(progress * 100)}%` : "Hold E to Revive";
  }

  private hideRevivePrompt() {
    if (this.revivePromptEl) {
      this.revivePromptEl.remove();
      this.revivePromptEl = null;
    }
  }
}
