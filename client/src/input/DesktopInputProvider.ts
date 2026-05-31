import Phaser from "phaser";
import type { InputProvider } from "./InputProvider.js";

export class DesktopInputProvider implements InputProvider {
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

  private scene!: Phaser.Scene;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private pendingFire = false;

  init(scene: Phaser.Scene) {
    this.scene = scene;
    const kb = scene.input.keyboard!;

    this.keys = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      UP: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      DOWN: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      LEFT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      RIGHT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      E: kb.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      G: kb.addKey(Phaser.Input.Keyboard.KeyCodes.G),
      F: kb.addKey(Phaser.Input.Keyboard.KeyCodes.F),
      R: kb.addKey(Phaser.Input.Keyboard.KeyCodes.R),
      ENTER: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
      TAB: kb.addKey(Phaser.Input.Keyboard.KeyCodes.TAB),
    };

    // Prevent Tab from switching browser tabs
    kb.addCapture([Phaser.Input.Keyboard.KeyCodes.TAB]);

    // Mouse fire events
    scene.input.on("pointerdown", this.onPointerDown, this);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    if (pointer.leftButtonDown()) {
      this.pendingFire = true;
    }
  }

  update(_time: number, _delta: number) {
    // --- Movement ---
    let mx = 0;
    let my = 0;
    if (this.keys.A.isDown || this.keys.LEFT.isDown) mx -= 1;
    if (this.keys.D.isDown || this.keys.RIGHT.isDown) mx += 1;
    if (this.keys.W.isDown || this.keys.UP.isDown) my -= 1;
    if (this.keys.S.isDown || this.keys.DOWN.isDown) my += 1;

    const mag = Math.sqrt(mx * mx + my * my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }
    this.moveVector.x = mx;
    this.moveVector.y = my;

    // --- Aim ---
    const pointer = this.scene.input.activePointer;
    const cam = this.scene.cameras.main;
    const dx = pointer.x - cam.centerX;
    const dy = pointer.y - cam.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
      this.aimVector.x = dx / dist;
      this.aimVector.y = dy / dist;
      this.aimAngle = Math.atan2(dy, dx);
    }

    // --- Fire ---
    this.firePressed = this.pendingFire;
    this.pendingFire = false;
    this.fireHeld = pointer.isDown;

    // --- One-shot actions ---
    this.interactPressed = Phaser.Input.Keyboard.JustDown(this.keys.E);
    this.grenadePressed = Phaser.Input.Keyboard.JustDown(this.keys.G);
    this.dropPressed = Phaser.Input.Keyboard.JustDown(this.keys.F);
    this.reloadPressed = Phaser.Input.Keyboard.JustDown(this.keys.R);
    this.chatPressed = Phaser.Input.Keyboard.JustDown(this.keys.ENTER);

    // --- Held ---
    this.scoreboardHeld = this.keys.TAB.isDown;
  }

  destroy() {
    this.scene.input.off("pointerdown", this.onPointerDown, this);
    this.scene.input.keyboard?.removeAllKeys(true);
    this.scene.input.keyboard?.removeAllListeners();
  }
}
