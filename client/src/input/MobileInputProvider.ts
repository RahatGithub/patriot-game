import type Phaser from "phaser";
import type { InputProvider } from "./InputProvider.js";

/**
 * Stub for mobile touch input. Real implementation comes in Prompt 05.
 */
export class MobileInputProvider implements InputProvider {
  moveVector = { x: 0, y: 0 };
  aimVector = { x: 1, y: 0 };
  aimAngle = 0;

  firePressed = false;
  fireHeld = false;
  interactPressed = false;
  grenadePressed = false;
  dropPressed = false;
  reloadPressed = false;
  chatPressed = false;
  scoreboardHeld = false;

  init(_scene: Phaser.Scene) {}
  update(_time: number, _delta: number) {}
  destroy() {}
}
