export interface JoystickOptions {
  /** CSS left/top for positioning (percentage strings) */
  left: string;
  top: string;
  /** Base radius in vh units */
  baseRadius?: number;
  /** Thumb radius in vh units */
  thumbRadius?: number;
  /** CSS class suffix for styling */
  id: string;
}

export class VirtualJoystick {
  value = { x: 0, y: 0 };
  magnitude = 0;
  active = false;

  private el: HTMLElement;
  private base: HTMLElement;
  private thumb: HTMLElement;
  private trackingId: number | null = null;
  private baseR: number;
  private centerX = 0;
  private centerY = 0;

  constructor(parent: HTMLElement, opts: JoystickOptions) {
    const br = opts.baseRadius ?? 8;
    const tr = opts.thumbRadius ?? 4;
    this.baseR = 0; // computed on first touch from actual rendered size

    this.el = document.createElement("div");
    this.el.style.cssText = `
      position: absolute;
      left: ${opts.left};
      top: ${opts.top};
      transform: translate(-50%, -50%);
      pointer-events: auto;
      touch-action: none;
    `;

    this.base = document.createElement("div");
    this.base.style.cssText = `
      width: ${br * 2}vh;
      height: ${br * 2}vh;
      border-radius: 50%;
      background: rgba(255,255,255,0.08);
      border: 2px solid rgba(255,255,255,0.15);
      position: relative;
    `;

    this.thumb = document.createElement("div");
    this.thumb.style.cssText = `
      width: ${tr * 2}vh;
      height: ${tr * 2}vh;
      border-radius: 50%;
      background: rgba(255,255,255,0.25);
      border: 2px solid rgba(255,255,255,0.35);
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      transition: background 0.1s;
    `;

    this.base.appendChild(this.thumb);
    this.el.appendChild(this.base);
    parent.appendChild(this.el);

    this.el.addEventListener("touchstart", this.onTouchStart, { passive: false });
    this.el.addEventListener("touchmove", this.onTouchMove, { passive: false });
    this.el.addEventListener("touchend", this.onTouchEnd, { passive: false });
    this.el.addEventListener("touchcancel", this.onTouchEnd, { passive: false });
  }

  private computeCenter() {
    const rect = this.base.getBoundingClientRect();
    this.centerX = rect.left + rect.width / 2;
    this.centerY = rect.top + rect.height / 2;
    this.baseR = rect.width / 2;
  }

  private onTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    if (this.trackingId !== null) return;
    const t = e.changedTouches[0];
    this.trackingId = t.identifier;
    this.active = true;
    this.computeCenter();
    this.processTouch(t.clientX, t.clientY);
    this.thumb.style.background = "rgba(255,255,255,0.4)";
  };

  private onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.trackingId) {
        this.processTouch(t.clientX, t.clientY);
        return;
      }
    }
  };

  private onTouchEnd = (e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.trackingId) {
        this.trackingId = null;
        this.active = false;
        this.value.x = 0;
        this.value.y = 0;
        this.magnitude = 0;
        this.thumb.style.transform = "translate(-50%, -50%)";
        this.thumb.style.background = "rgba(255,255,255,0.25)";
        return;
      }
    }
  };

  private processTouch(tx: number, ty: number) {
    let dx = tx - this.centerX;
    let dy = ty - this.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(dist, this.baseR);

    if (dist > 0) {
      dx = (dx / dist) * clamped;
      dy = (dy / dist) * clamped;
    }

    this.value.x = this.baseR > 0 ? dx / this.baseR : 0;
    this.value.y = this.baseR > 0 ? dy / this.baseR : 0;
    this.magnitude = this.baseR > 0 ? clamped / this.baseR : 0;

    // Move thumb visually using transform
    const pctX = (dx / this.baseR) * 50;
    const pctY = (dy / this.baseR) * 50;
    this.thumb.style.transform = `translate(calc(-50% + ${pctX}%), calc(-50% + ${pctY}%))`;
  }

  destroy() {
    this.el.removeEventListener("touchstart", this.onTouchStart);
    this.el.removeEventListener("touchmove", this.onTouchMove);
    this.el.removeEventListener("touchend", this.onTouchEnd);
    this.el.removeEventListener("touchcancel", this.onTouchEnd);
    this.el.remove();
  }
}
