import type { InputManager } from "../input/InputManager.js";

const ACTION_KEYS = [
  "firePressed",
  "fireHeld",
  "interactPressed",
  "grenadePressed",
  "dropPressed",
  "reloadPressed",
  "chatPressed",
  "scoreboardHeld",
] as const;

export class InputDebugOverlay {
  private el: HTMLElement;
  private animId = 0;
  private inputManager: InputManager;
  private flash: Record<string, number> = {};

  constructor(inputManager: InputManager) {
    this.inputManager = inputManager;

    this.el = document.createElement("div");
    this.el.id = "input-debug";
    this.el.style.cssText = `
      position: fixed;
      top: 8px;
      right: 8px;
      background: rgba(0,0,0,0.85);
      border: 1px solid #556b2f;
      border-radius: 6px;
      padding: 10px 14px;
      font-family: 'Consolas', monospace;
      font-size: 12px;
      color: #ccc;
      z-index: 100;
      pointer-events: none;
      min-width: 220px;
      line-height: 1.6;
    `;
    document.body.appendChild(this.el);

    this.loop();
  }

  private loop = () => {
    this.render();
    this.animId = requestAnimationFrame(this.loop);
  };

  private render() {
    const im = this.inputManager;
    const now = performance.now();

    // Track flashes for one-shot flags
    for (const key of ACTION_KEYS) {
      if (im[key]) this.flash[key] = now;
    }

    const mv = im.moveVector;
    const deg = ((im.aimAngle * 180) / Math.PI).toFixed(0);

    let html = `<div style="color:#6b8e23;font-weight:bold;margin-bottom:4px">INPUT DEBUG</div>`;
    html += `<div>move: (${mv.x.toFixed(2)}, ${mv.y.toFixed(2)})</div>`;
    html += `<div>aim:  ${deg}\u00b0</div>`;
    html += `<div style="border-top:1px solid #333;margin:4px 0;padding-top:4px">`;

    for (const key of ACTION_KEYS) {
      const active = im[key];
      const recent = now - (this.flash[key] ?? 0) < 200;
      const color = active ? "#2a2" : recent ? "#6b8e23" : "#555";
      const symbol = active ? "\u2713" : recent ? "\u2713" : "\u00b7";
      html += `<div style="color:${color}">${symbol} ${key}</div>`;
    }

    html += `</div>`;
    this.el.innerHTML = html;
  }

  destroy() {
    cancelAnimationFrame(this.animId);
    this.el.remove();
  }
}
