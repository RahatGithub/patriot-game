import Phaser from "phaser";

const SFX_KEYS = [
  "footstep", "pistol_fire", "mk18_fire", "mg_fire", "bazooka_fire", "tank_fire",
  "grenade_throw", "explosion", "explosion_large",
  "hit_flesh", "hit_wall", "hit_metal",
  "downed", "revive", "death", "promotion", "checkpoint",
  "match_start", "match_win", "match_lose",
  "vehicle_engine", "tank_engine", "vehicle_explode",
  "crate_break", "pickup", "cure", "weapon_pickup", "blocked",
  "ui_click", "timer_tick", "reload",
] as const;

type SfxKey = typeof SFX_KEYS[number];

/** Weapon ID → fire sound key */
const WEAPON_FIRE_SFX: Record<string, SfxKey> = {
  pistol: "pistol_fire",
  mk18: "mk18_fire",
  mg: "mg_fire",
  bazooka: "bazooka_fire",
  tank_cannon: "tank_fire",
  grenade: "grenade_throw",
};

/** Max distance for spatial attenuation by category */
const SPATIAL_RANGES: Partial<Record<SfxKey, number>> = {
  footstep: 300,
  pistol_fire: 800,
  mk18_fire: 800,
  mg_fire: 1200,
  bazooka_fire: 1500,
  tank_fire: 1500,
  grenade_throw: 600,
  explosion: 1500,
  explosion_large: 2000,
  hit_flesh: 500,
  hit_wall: 400,
  hit_metal: 600,
  downed: 600,
  crate_break: 600,
  vehicle_explode: 1500,
  vehicle_engine: 600,
  tank_engine: 800,
};

export class AudioManager {
  private scene: Phaser.Scene | null = null;
  private loaded = new Set<string>();
  private muted = false;
  private masterVolume = 0.8;
  private sfxVolume = 0.8;
  private localPlayerPos: { x: number; y: number } = { x: 0, y: 0 };

  constructor() {
    this.muted = localStorage.getItem("patriot_muted") === "1";
  }

  preload(scene: Phaser.Scene) {
    for (const key of SFX_KEYS) {
      scene.load.audio(key, `assets/audio/sfx/${key}.ogg`);
    }
    // Gracefully skip missing files
    scene.load.on("loaderror", (file: any) => {
      if (file.type === "audio") {
        // Silently skip missing audio — game works without sounds
      }
    });
  }

  init(scene: Phaser.Scene) {
    this.scene = scene;
    for (const key of SFX_KEYS) {
      if (scene.cache.audio.exists(key)) {
        this.loaded.add(key);
      }
    }
  }

  setLocalPlayerPos(x: number, y: number) {
    this.localPlayerPos.x = x;
    this.localPlayerPos.y = y;
  }

  play(key: string, opts?: { x?: number; y?: number; maxDistance?: number; loop?: boolean; rate?: number; volume?: number }) {
    if (this.muted || !this.scene || !this.loaded.has(key)) return;

    let vol = (opts?.volume ?? 1.0) * this.sfxVolume * this.masterVolume;

    // Spatial attenuation
    if (opts?.x !== undefined && opts?.y !== undefined) {
      const dist = Math.hypot(opts.x - this.localPlayerPos.x, opts.y - this.localPlayerPos.y);
      const max = opts.maxDistance ?? SPATIAL_RANGES[key as SfxKey] ?? 1000;
      const falloff = Math.max(0, 1 - dist / max);
      vol *= falloff;
    }

    if (vol <= 0.01) return;
    vol = Math.min(1.0, vol);

    this.scene.sound.play(key, { volume: vol, loop: opts?.loop ?? false, rate: opts?.rate ?? 1.0 });
  }

  playWeaponFire(weaponId: string, x: number, y: number) {
    const sfxKey = WEAPON_FIRE_SFX[weaponId];
    if (sfxKey) this.play(sfxKey, { x, y });
  }

  stop(key: string) {
    if (!this.scene) return;
    this.scene.sound.stopByKey(key);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem("patriot_muted", this.muted ? "1" : "0");
    if (this.muted && this.scene) {
      this.scene.sound.stopAll();
    }
    return this.muted;
  }

  get isMuted() { return this.muted; }
}

/** Singleton */
export const audioManager = new AudioManager();
