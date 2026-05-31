import { VirtualJoystick } from "./VirtualJoystick.js";
import { TouchButton } from "./TouchButton.js";

export class TouchControlsOverlay {
  readonly moveJoystick: VirtualJoystick;
  readonly aimJoystick: VirtualJoystick;
  readonly fireBtn: TouchButton;
  readonly interactBtn: TouchButton;
  readonly grenadeBtn: TouchButton;
  readonly dropBtn: TouchButton;
  readonly chatBtn: TouchButton;

  private container: HTMLElement;

  constructor() {
    this.container = document.createElement("div");
    this.container.id = "touch-controls";
    this.container.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 15;
      pointer-events: none;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    `;

    // Left joystick — movement
    this.moveJoystick = new VirtualJoystick(this.container, {
      id: "move",
      left: "14%",
      top: "70%",
      baseRadius: 8,
      thumbRadius: 4,
    });

    // Right joystick — aim
    this.aimJoystick = new VirtualJoystick(this.container, {
      id: "aim",
      left: "86%",
      top: "70%",
      baseRadius: 8,
      thumbRadius: 4,
    });

    // Fire button — large, right side
    this.fireBtn = new TouchButton(this.container, {
      id: "fire",
      label: "\u2022", // bullet dot
      left: "73%",
      top: "78%",
      size: "9vh",
    });
    // Make fire button red-tinted
    const fireEl = this.container.lastElementChild as HTMLElement;
    fireEl.style.background = "rgba(180,30,30,0.2)";
    fireEl.style.borderColor = "rgba(180,30,30,0.4)";
    fireEl.style.color = "rgba(255,100,100,0.8)";
    fireEl.style.fontSize = "clamp(20px, 4vh, 36px)";

    // Interact button — left side
    this.interactBtn = new TouchButton(this.container, {
      id: "interact",
      label: "E",
      left: "27%",
      top: "78%",
      size: "7vh",
    });

    // Grenade — right side, above fire
    this.grenadeBtn = new TouchButton(this.container, {
      id: "grenade",
      label: "\uD83D\uDCA3",
      left: "73%",
      top: "55%",
      size: "6vh",
    });

    // Drop weapon — far right
    this.dropBtn = new TouchButton(this.container, {
      id: "drop",
      label: "\u2B07",
      left: "94%",
      top: "50%",
      size: "5.5vh",
    });

    // Chat — top right corner
    this.chatBtn = new TouchButton(this.container, {
      id: "chat",
      label: "\uD83D\uDCAC",
      left: "95%",
      top: "8%",
      size: "5vh",
    });

    document.body.appendChild(this.container);
  }

  destroy() {
    this.moveJoystick.destroy();
    this.aimJoystick.destroy();
    this.fireBtn.destroy();
    this.interactBtn.destroy();
    this.grenadeBtn.destroy();
    this.dropBtn.destroy();
    this.chatBtn.destroy();
    this.container.remove();
  }
}
