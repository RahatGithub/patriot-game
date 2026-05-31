import Phaser from "phaser";
import { HelloScene } from "./scenes/HelloScene.js";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  width: 1920,
  height: 1080,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  backgroundColor: "#1a1a1a",
  scene: [HelloScene],
};

new Phaser.Game(config);
