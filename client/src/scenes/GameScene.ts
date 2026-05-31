import Phaser from "phaser";
import {
  PATRIOT_MAP,
  PLAYER_RUN_SPEED,
  PLAYER_RADIUS,
  RECONCILIATION_THRESHOLD,
} from "@patriot/shared";
import type { InputCommand } from "@patriot/shared";
import { InputManager } from "../input/InputManager.js";
import { InputDebugOverlay } from "../ui/InputDebugOverlay.js";
import { getDebugFlag } from "../utils/settings.js";
import type { DeviceProfile } from "../utils/deviceProfile.js";
import { Player } from "../entities/Player.js";
import type { NetworkManager } from "../network/NetworkManager.js";
import { checkWallCollisionClient } from "../systems/collisionClient.js";

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
  private sessionId = "";
  private stateSetup = false;

  constructor() {
    super("GameScene");
  }

  init(data: any) {
    this.deviceProfile = data?.deviceProfile || "desktop";
    this.networkManager = data?.networkManager || null;
  }

  preload() {
    this.load.image("soldier_patriot", "/assets/sprites/characters/soldier_patriot.png");
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

    // --- Render checkpoints ---
    const cpGfx = this.add.graphics();
    for (const cp of map.checkpoints) {
      cpGfx.fillStyle(0xffff00, 0.15);
      cpGfx.fillCircle(cp.position.x, cp.position.y, cp.radius);
      cpGfx.lineStyle(2, 0xffff00, 0.4);
      cpGfx.strokeCircle(cp.position.x, cp.position.y, cp.radius);
      this.add
        .text(cp.position.x, cp.position.y - cp.radius - 16, `Checkpoint ${cp.order}`, {
          fontSize: "14px",
          color: "#ffff88",
        })
        .setOrigin(0.5);
      cpGfx.fillStyle(0xcc2222, 0.8);
      cpGfx.fillRect(cp.position.x - 8, cp.position.y - 20, 16, 24);
      cpGfx.fillStyle(0xcc2222, 1);
      cpGfx.fillTriangle(
        cp.position.x - 8, cp.position.y - 20,
        cp.position.x - 8, cp.position.y - 8,
        cp.position.x + 8, cp.position.y - 14
      );
    }

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

    if (getDebugFlag("input")) {
      this.debugOverlay = new InputDebugOverlay(this.inputManager);
    }

    // --- Multiplayer state sync ---
    this.setupNetworking();

    // Cleanup
    this.events.on("shutdown", () => {
      this.inputManager?.destroy();
      this.localPlayer?.destroy();
      this.remotePlayers.forEach((p) => p.destroy());
      this.remotePlayers.clear();
      this.debugOverlay?.destroy();
      this.debugOverlay = null;
    });

    this.game.events.emit("gameSceneReady");
  }

  private setupNetworking() {
    const room = this.networkManager?.getRoom();
    if (!room) return;

    this.sessionId = room.sessionId;

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

    // Process existing players
    room.state.players.forEach((p: any, sid: string) => {
      this.onPlayerAdd(p, sid);
    });

    // Listen for new players
    room.state.players.onAdd((p: any, sid: string) => {
      if (!this.remotePlayers.has(sid) && sid !== this.sessionId) {
        this.onPlayerAdd(p, sid);
      }
    });

    // Listen for player removal
    room.state.players.onRemove((_p: any, sid: string) => {
      this.onPlayerRemove(sid);
    });

    // Listen for state changes — update remote players + reconcile local
    room.onStateChange(() => {
      room.state.players.forEach((p: any, sid: string) => {
        if (sid === this.sessionId) {
          this.reconcileLocal(p);
        } else {
          const remote = this.remotePlayers.get(sid);
          if (remote) {
            remote.pushSnapshot(p.x, p.y, p.aimAngle);
            remote.setHp(p.hp);
          }
        }
      });
    });
  }

  private onPlayerAdd(p: any, sid: string) {
    const isLocal = sid === this.sessionId;

    if (isLocal && this.localPlayer) return;
    if (!isLocal && this.remotePlayers.has(sid)) return;

    const player = new Player(this, sid, p.name, p.x, p.y, isLocal);
    this.physics.add.collider(player.sprite, this.wallGroup);

    if (isLocal) {
      this.localPlayer = player;
      if (!this.freeCam) {
        this.cameras.main.startFollow(player.sprite, true, 0.1, 0.1);
      }
    } else {
      this.remotePlayers.set(sid, player);
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
    } else if (this.localPlayer && this.networkManager) {
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
    }

    // Update all players
    this.localPlayer?.update(delta);
    this.remotePlayers.forEach((p) => {
      p.interpolate();
      p.update(delta);
    });
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
}
