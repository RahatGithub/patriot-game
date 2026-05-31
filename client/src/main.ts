import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene.js";
import { GameScene } from "./scenes/GameScene.js";
import { HUDScene } from "./scenes/HUDScene.js";
import { ScreenManager } from "./ui/ScreenManager.js";
import { NetworkManager } from "./network/NetworkManager.js";
import { setupOrientationEnforcement } from "./utils/orientation.js";
import {
  detectDevice,
  getStoredProfile,
  setStoredProfile,
} from "./utils/deviceProfile.js";

// Initialize Phaser with physics and all scenes
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game-container",
  width: 1920,
  height: 1080,
  physics: {
    default: "arcade",
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  backgroundColor: "#1a1a1a",
  scene: [BootScene, GameScene, HUDScene],
});

// Initialize UI layer
const overlay = document.getElementById("ui-overlay")!;
const network = new NetworkManager();
const screens = new ScreenManager(overlay);
screens.network = network;
screens.game = game;

// Leave match handler: stop game scenes, return to splash
game.events.on("leaveMatch", () => {
  game.scene.stop("HUDScene");
  game.scene.stop("GameScene");
  game.scene.start("BootScene");
  network.leaveRoom();
  screens.show("splash");
});

// Check URL for room code deep link
const params = new URLSearchParams(window.location.search);
const roomCode = params.get("room");

// Device profile resolution
let profile = getStoredProfile();

if (!profile) {
  const detected = detectDevice();
  if (detected) {
    profile = detected;
    setStoredProfile(profile);
  }
}

if (profile) {
  screens.deviceProfile = profile;
  if (roomCode) {
    screens.show("joinRoom", { code: roomCode.toUpperCase() });
  } else {
    screens.show("splash");
  }
} else {
  if (roomCode) screens.setPendingRoomCode(roomCode.toUpperCase());
  screens.show("deviceSelect");
}

// Mobile landscape enforcement
setupOrientationEnforcement();
