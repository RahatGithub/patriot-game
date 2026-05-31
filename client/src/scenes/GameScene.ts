import Phaser from "phaser";
import { PATRIOT_MAP } from "@patriot/shared";
import { InputManager } from "../input/InputManager.js";
import { InputDebugOverlay } from "../ui/InputDebugOverlay.js";
import { getDebugFlag } from "../utils/settings.js";
import type { DeviceProfile } from "../utils/deviceProfile.js";
import { Player } from "../entities/Player.js";
import { MovementSystem } from "../systems/MovementSystem.js";

const FREE_CAM_SPEED = 600;

export class GameScene extends Phaser.Scene {
  wallGroup!: Phaser.Physics.Arcade.StaticGroup;
  inputManager!: InputManager;
  localPlayer!: Player;

  private movementSystem!: MovementSystem;
  private gridGfx: Phaser.GameObjects.Graphics | null = null;
  private gridTexts: Phaser.GameObjects.Text[] = [];
  private gridVisible = false;
  private cpIndex = 0;
  private debugOverlay: InputDebugOverlay | null = null;
  private deviceProfile: DeviceProfile = "desktop";
  private freeCam = false;
  private freeCamKeys!: Record<string, Phaser.Input.Keyboard.Key>;
  private playerName = "Player";

  constructor() {
    super("GameScene");
  }

  init(data: any) {
    this.deviceProfile = data?.deviceProfile || "desktop";
    this.playerName = data?.playerName || "Player";
  }

  preload() {
    this.load.image("soldier_patriot", "/assets/sprites/characters/soldier_patriot.png");
    this.load.on("loaderror", (file: any) => {
      console.warn(`[GameScene] Asset not found: ${file.key} — using placeholder`);
    });
  }

  create() {
    const map = PATRIOT_MAP;

    // Physics world bounds
    this.physics.world.setBounds(0, 0, map.width, map.height);

    // --- Render zones ---
    const zoneGfx = this.add.graphics();
    for (const zone of map.zones) {
      const b = zone.bounds;
      zoneGfx.fillStyle(parseInt(zone.floorColor.replace("#", ""), 16), 1);
      zoneGfx.fillRect(b.x, b.y, b.width, b.height);
    }

    // --- Render water pools ---
    const waterGfx = this.add.graphics();
    waterGfx.fillStyle(0x2a6a8a, 0.8);
    for (const pool of map.waterPools) {
      waterGfx.fillRect(pool.x, pool.y, pool.width, pool.height);
    }

    // --- Render walls (visual + physics) ---
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

    // --- Spawn local player ---
    const spawn = map.playerSpawn;
    const px = spawn.x + Math.random() * spawn.width;
    const py = spawn.y + Math.random() * spawn.height;
    this.localPlayer = new Player(this, "local", this.playerName, px, py, true);

    // Player-wall collision
    this.physics.add.collider(this.localPlayer.sprite, this.wallGroup);

    // Movement system
    this.movementSystem = new MovementSystem(
      this, this.inputManager, this.localPlayer, this.deviceProfile
    );

    // --- Camera setup ---
    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.width, map.height);
    cam.setZoom(this.deviceProfile === "mobile" ? 0.8 : 1.0);
    cam.startFollow(this.localPlayer.sprite, true, 0.1, 0.1);

    // --- Debug keys ---
    const kb = this.input.keyboard!;

    // Free-cam keys (used when freeCam is true)
    this.freeCamKeys = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W, false),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A, false),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S, false),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D, false),
    };

    // T — teleport camera to next checkpoint
    const tKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.T);
    tKey.on("down", () => {
      const cps = map.checkpoints;
      if (cps.length === 0) return;
      const cp = cps[this.cpIndex % cps.length];
      cam.centerOn(cp.position.x, cp.position.y);
      this.cpIndex++;
    });

    // F3 — toggle debug grid
    const f3Key = kb.addKey(Phaser.Input.Keyboard.KeyCodes.F3);
    kb.addCapture([Phaser.Input.Keyboard.KeyCodes.F3]);
    f3Key.on("down", () => this.toggleGrid());

    // F4 — toggle free-cam
    const f4Key = kb.addKey(Phaser.Input.Keyboard.KeyCodes.F4);
    kb.addCapture([Phaser.Input.Keyboard.KeyCodes.F4]);
    f4Key.on("down", () => {
      this.freeCam = !this.freeCam;
      if (this.freeCam) {
        cam.stopFollow();
      } else {
        cam.startFollow(this.localPlayer.sprite, true, 0.1, 0.1);
      }
    });

    // F5 — toggle physics debug
    const f5Key = kb.addKey(Phaser.Input.Keyboard.KeyCodes.F5);
    kb.addCapture([Phaser.Input.Keyboard.KeyCodes.F5]);
    f5Key.on("down", () => {
      this.physics.world.debugGraphic?.setVisible(
        !this.physics.world.debugGraphic?.visible
      );
      if (!this.physics.world.debugGraphic) {
        this.physics.world.createDebugGraphic();
      }
    });

    // Input debug overlay
    if (getDebugFlag("input")) {
      this.debugOverlay = new InputDebugOverlay(this.inputManager);
    }

    // Cleanup on shutdown
    this.events.on("shutdown", () => {
      this.inputManager?.destroy();
      this.localPlayer?.destroy();
      this.debugOverlay?.destroy();
      this.debugOverlay = null;
    });

    // Signal ready
    this.game.events.emit("gameSceneReady");
  }

  update(_time: number, delta: number) {
    if (this.freeCam) {
      // Free-camera mode
      const cam = this.cameras.main;
      const spd = (FREE_CAM_SPEED * delta) / 1000;
      if (this.freeCamKeys.A.isDown) cam.scrollX -= spd;
      if (this.freeCamKeys.D.isDown) cam.scrollX += spd;
      if (this.freeCamKeys.W.isDown) cam.scrollY -= spd;
      if (this.freeCamKeys.S.isDown) cam.scrollY += spd;
    } else {
      // Normal gameplay mode
      this.movementSystem.update(_time, delta);
    }

    this.localPlayer.update(delta);
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
        const t = this.add
          .text(x + 4, y + 2, `${x},${y}`, {
            fontSize: "10px",
            color: "rgba(255,255,255,0.3)",
          })
          .setDepth(1001);
        this.gridTexts.push(t);
      }
    }
    this.gridVisible = true;
  }
}
