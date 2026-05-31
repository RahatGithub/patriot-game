import type Phaser from "phaser";

export interface InputProvider {
  moveVector: { x: number; y: number };
  aimVector: { x: number; y: number };
  aimAngle: number;

  firePressed: boolean;
  fireHeld: boolean;
  interactPressed: boolean;
  grenadePressed: boolean;
  dropPressed: boolean;
  reloadPressed: boolean;
  chatPressed: boolean;
  scoreboardHeld: boolean;

  init(scene: Phaser.Scene): void;
  update(time: number, delta: number): void;
  destroy(): void;
}
