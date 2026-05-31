import type Phaser from "phaser";
import type { InputProvider } from "./InputProvider.js";
import { TouchControlsOverlay } from "./TouchControlsOverlay.js";

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

  private overlay: TouchControlsOverlay | null = null;
  private lastAimX = 1;
  private lastAimY = 0;

  init(_scene: Phaser.Scene) {
    this.overlay = new TouchControlsOverlay();
  }

  update(_time: number, _delta: number) {
    if (!this.overlay) return;

    // Movement joystick
    this.moveVector.x = this.overlay.moveJoystick.value.x;
    this.moveVector.y = this.overlay.moveJoystick.value.y;

    // Aim joystick — retain last direction when released
    if (this.overlay.aimJoystick.active) {
      const av = this.overlay.aimJoystick.value;
      const mag = Math.sqrt(av.x * av.x + av.y * av.y);
      if (mag > 0.1) {
        this.lastAimX = av.x / mag;
        this.lastAimY = av.y / mag;
      }
    }
    this.aimVector.x = this.lastAimX;
    this.aimVector.y = this.lastAimY;
    this.aimAngle = Math.atan2(this.aimVector.y, this.aimVector.x);

    // Buttons
    this.firePressed = this.overlay.fireBtn.consumePress();
    this.fireHeld = this.overlay.fireBtn.held;
    this.interactPressed = this.overlay.interactBtn.consumePress();
    this.grenadePressed = this.overlay.grenadeBtn.consumePress();
    this.dropPressed = this.overlay.dropBtn.consumePress();
    this.chatPressed = this.overlay.chatBtn.consumePress();

    // Not available on mobile
    this.reloadPressed = false;
    this.scoreboardHeld = false;
  }

  destroy() {
    this.overlay?.destroy();
    this.overlay = null;
  }
}
