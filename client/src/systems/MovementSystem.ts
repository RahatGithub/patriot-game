import type { InputManager } from "../input/InputManager.js";
import type { Player } from "../entities/Player.js";
import type { DeviceProfile } from "../utils/deviceProfile.js";
import { PLAYER_RUN_SPEED } from "@patriot/shared";

export class MovementSystem {
  private inputManager: InputManager;
  private player: Player;
  private scene: Phaser.Scene;
  private deviceProfile: DeviceProfile;

  constructor(
    scene: Phaser.Scene,
    inputManager: InputManager,
    player: Player,
    deviceProfile: DeviceProfile
  ) {
    this.scene = scene;
    this.inputManager = inputManager;
    this.player = player;
    this.deviceProfile = deviceProfile;
  }

  update(_time: number, _delta: number) {
    const im = this.inputManager;
    const body = this.player.sprite.body as Phaser.Physics.Arcade.Body;

    // Movement velocity
    const vx = im.moveVector.x * PLAYER_RUN_SPEED;
    const vy = im.moveVector.y * PLAYER_RUN_SPEED;
    body.setVelocity(vx, vy);

    // Aim
    let angle: number;
    if (this.deviceProfile === "desktop") {
      // Desktop: aim toward mouse world position
      const pointer = this.scene.input.activePointer;
      const dx = pointer.worldX - this.player.sprite.x;
      const dy = pointer.worldY - this.player.sprite.y;
      angle = Math.atan2(dy, dx);
    } else {
      // Mobile: use aim joystick vector
      angle = im.aimAngle;
    }
    this.player.setAimAngle(angle);
  }
}
