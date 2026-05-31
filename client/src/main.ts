import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene.js";
import { ScreenManager } from "./ui/ScreenManager.js";
import { NetworkManager } from "./network/NetworkManager.js";
import { setupOrientationEnforcement } from "./utils/orientation.js";

// Initialize Phaser (sits behind the UI overlay)
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game-container",
  width: 1920,
  height: 1080,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  backgroundColor: "#1a1a1a",
  scene: [BootScene],
});

// Initialize UI layer
const overlay = document.getElementById("ui-overlay")!;
const network = new NetworkManager();
const screens = new ScreenManager(overlay);
screens.network = network;

// Check URL for room code deep link
const params = new URLSearchParams(window.location.search);
const roomCode = params.get("room");

if (roomCode) {
  screens.show("joinRoom", { code: roomCode.toUpperCase() });
} else {
  screens.show("splash");
}

// Mobile landscape enforcement
setupOrientationEnforcement();
