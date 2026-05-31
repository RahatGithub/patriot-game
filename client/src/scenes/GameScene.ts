import Phaser from "phaser";
import { PATRIOT_MAP } from "@patriot/shared";
import { InputManager } from "../input/InputManager.js";
import { InputDebugOverlay } from "../ui/InputDebugOverlay.js";
import { getDebugFlag } from "../utils/settings.js";
import type { DeviceProfile } from "../utils/deviceProfile.js";

const CAM_SPEED = 600;

export class GameScene extends Phaser.Scene {
  wallGroup!: Phaser.Physics.Arcade.StaticGroup;
  inputManager!: InputManager;

  private camKeys!: Record<string, Phaser.Input.Keyboard.Key>;
  private gridGfx: Phaser.GameObjects.Graphics | null = null;
  private gridTexts: Phaser.GameObjects.Text[] = [];
  private gridVisible = false;
  private cpIndex = 0;
  private debugOverlay: InputDebugOverlay | null = null;
  private deviceProfile: DeviceProfile = "desktop";

  constructor() {
    super("GameScene");
  }

  init(data: any) {
    this.deviceProfile = data?.deviceProfile || "desktop";
  }

  preload() {
    // Try loading soldier sprite — handle missing file gracefully
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
      // Yellow translucent circle
      cpGfx.fillStyle(0xffff00, 0.15);
      cpGfx.fillCircle(cp.position.x, cp.position.y, cp.radius);
      cpGfx.lineStyle(2, 0xffff00, 0.4);
      cpGfx.strokeCircle(cp.position.x, cp.position.y, cp.radius);

      // Label
      this.add
        .text(cp.position.x, cp.position.y - cp.radius - 16, `Checkpoint ${cp.order}`, {
          fontSize: "14px",
          color: "#ffff88",
        })
        .setOrigin(0.5);

      // Red flag placeholder
      cpGfx.fillStyle(0xcc2222, 0.8);
      cpGfx.fillRect(cp.position.x - 8, cp.position.y - 20, 16, 24);
      cpGfx.fillStyle(0xcc2222, 1);
      cpGfx.fillTriangle(
        cp.position.x - 8,
        cp.position.y - 20,
        cp.position.x - 8,
        cp.position.y - 8,
        cp.position.x + 8,
        cp.position.y - 14
      );
    }

    // --- Camera setup ---
    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.width, map.height);
    const spawn = map.playerSpawn;
    cam.centerOn(spawn.x + spawn.width / 2, spawn.y + spawn.height / 2);
    cam.setZoom(this.deviceProfile === "mobile" ? 0.8 : 1.0);

    // --- Camera keys (free-cam for testing) ---
    const kb = this.input.keyboard!;
    this.camKeys = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      UP: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      DOWN: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      LEFT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      RIGHT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
    };

    // T — teleport to next checkpoint
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

    // --- Input manager ---
    this.inputManager = new InputManager();
    this.inputManager.init(this, this.deviceProfile);

    // Input debug overlay
    if (getDebugFlag("input")) {
      this.debugOverlay = new InputDebugOverlay(this.inputManager);
    }

    // Cleanup on shutdown
    this.events.on("shutdown", () => {
      this.inputManager?.destroy();
      this.debugOverlay?.destroy();
      this.debugOverlay = null;
    });

    // Signal ready
    this.game.events.emit("gameSceneReady");
  }

  update(_time: number, delta: number) {
    // Free-camera movement
    const cam = this.cameras.main;
    const spd = (CAM_SPEED * delta) / 1000;
    let dx = 0;
    let dy = 0;
    if (this.camKeys.A.isDown || this.camKeys.LEFT.isDown) dx -= spd;
    if (this.camKeys.D.isDown || this.camKeys.RIGHT.isDown) dx += spd;
    if (this.camKeys.W.isDown || this.camKeys.UP.isDown) dy -= spd;
    if (this.camKeys.S.isDown || this.camKeys.DOWN.isDown) dy += spd;
    cam.scrollX += dx;
    cam.scrollY += dy;
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
    const step = 100;
    const gfx = this.add.graphics();
    gfx.lineStyle(1, 0xffffff, 0.1);
    gfx.setDepth(1000);

    for (let x = 0; x <= map.width; x += step) {
      gfx.moveTo(x, 0);
      gfx.lineTo(x, map.height);
    }
    for (let y = 0; y <= map.height; y += step) {
      gfx.moveTo(0, y);
      gfx.lineTo(map.width, y);
    }
    gfx.strokePath();
    this.gridGfx = gfx;

    // Coordinate labels every 500px
    const labelStep = 500;
    for (let x = 0; x <= map.width; x += labelStep) {
      for (let y = 0; y <= map.height; y += labelStep) {
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
