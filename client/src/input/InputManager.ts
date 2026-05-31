import type Phaser from "phaser";
import type { DeviceProfile } from "../utils/deviceProfile.js";
import type { InputProvider } from "./InputProvider.js";
import { DesktopInputProvider } from "./DesktopInputProvider.js";
import { MobileInputProvider } from "./MobileInputProvider.js";

export class InputManager {
  // Continuous state (per-frame)
  moveVector = { x: 0, y: 0 };
  aimVector = { x: 1, y: 0 };
  aimAngle = 0;

  // Action flags
  firePressed = false;
  fireHeld = false;
  interactPressed = false;
  grenadePressed = false;
  dropPressed = false;
  reloadPressed = false;
  chatPressed = false;
  scoreboardHeld = false;

  private provider: InputProvider | null = null;
  private scene: Phaser.Scene | null = null;

  init(scene: Phaser.Scene, profile: DeviceProfile): void {
    this.scene = scene;
    this.provider =
      profile === "desktop"
        ? new DesktopInputProvider()
        : new MobileInputProvider();
    this.provider.init(scene);
    scene.events.on("update", this.onUpdate, this);
  }

  private onUpdate(time: number, delta: number) {
    if (!this.provider) return;
    this.provider.update(time, delta);

    this.moveVector.x = this.provider.moveVector.x;
    this.moveVector.y = this.provider.moveVector.y;
    this.aimVector.x = this.provider.aimVector.x;
    this.aimVector.y = this.provider.aimVector.y;
    this.aimAngle = this.provider.aimAngle;

    this.firePressed = this.provider.firePressed;
    this.fireHeld = this.provider.fireHeld;
    this.interactPressed = this.provider.interactPressed;
    this.grenadePressed = this.provider.grenadePressed;
    this.dropPressed = this.provider.dropPressed;
    this.reloadPressed = this.provider.reloadPressed;
    this.chatPressed = this.provider.chatPressed;
    this.scoreboardHeld = this.provider.scoreboardHeld;
  }

  update(time: number, delta: number): void {
    this.onUpdate(time, delta);
  }

  destroy(): void {
    this.scene?.events.off("update", this.onUpdate, this);
    this.provider?.destroy();
    this.provider = null;
    this.scene = null;
  }
}
