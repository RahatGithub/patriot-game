export interface TouchButtonOptions {
  label: string;
  left: string;
  top: string;
  size?: string; // CSS size, e.g. "60px" or "7vh"
  id: string;
}

export class TouchButton {
  pressed = false;
  held = false;

  private el: HTMLElement;
  private trackingId: number | null = null;
  private _justPressed = false;

  constructor(parent: HTMLElement, opts: TouchButtonOptions) {
    const sz = opts.size ?? "7vh";

    this.el = document.createElement("div");
    this.el.style.cssText = `
      position: absolute;
      left: ${opts.left};
      top: ${opts.top};
      transform: translate(-50%, -50%);
      width: ${sz};
      height: ${sz};
      min-width: 44px;
      min-height: 44px;
      border-radius: 50%;
      background: rgba(255,255,255,0.12);
      border: 2px solid rgba(255,255,255,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: clamp(14px, 2.5vh, 22px);
      color: rgba(255,255,255,0.7);
      user-select: none;
      pointer-events: auto;
      touch-action: none;
      -webkit-tap-highlight-color: transparent;
      transition: background 0.1s;
    `;
    this.el.textContent = opts.label;

    parent.appendChild(this.el);

    this.el.addEventListener("touchstart", this.onDown, { passive: false });
    this.el.addEventListener("touchend", this.onUp, { passive: false });
    this.el.addEventListener("touchcancel", this.onUp, { passive: false });
  }

  private onDown = (e: TouchEvent) => {
    e.preventDefault();
    if (this.trackingId !== null) return;
    this.trackingId = e.changedTouches[0].identifier;
    this.held = true;
    this._justPressed = true;
    this.el.style.background = "rgba(255,255,255,0.3)";
  };

  private onUp = (e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.trackingId) {
        this.trackingId = null;
        this.held = false;
        this.el.style.background = "rgba(255,255,255,0.12)";
        return;
      }
    }
  };

  /** Call once per frame — returns true on first frame of press only */
  consumePress(): boolean {
    const v = this._justPressed;
    this._justPressed = false;
    return v;
  }

  destroy() {
    this.el.removeEventListener("touchstart", this.onDown);
    this.el.removeEventListener("touchend", this.onUp);
    this.el.removeEventListener("touchcancel", this.onUp);
    this.el.remove();
  }
}
