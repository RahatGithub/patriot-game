import type { Screen, ScreenContext } from "../ScreenManager.js";

export class MatchStartingScreen implements Screen {
  render(_ctx: ScreenContext): HTMLElement {
    const el = document.createElement("div");
    el.className = "screen";
    el.innerHTML = `
      <div class="card" style="text-align:center">
        <h2>Match Starting...</h2>
        <div class="spinner"></div>
        <p class="subtitle">Get ready!</p>
      </div>
    `;
    return el;
  }
}
