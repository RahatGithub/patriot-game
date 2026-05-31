import type { Screen, ScreenContext } from "../ScreenManager.js";

export class SplashScreen implements Screen {
  render(ctx: ScreenContext): HTMLElement {
    const { screens } = ctx;

    const el = document.createElement("div");
    el.className = "screen";
    el.innerHTML = `
      <div class="card" style="text-align:center">
        <h1>PATRIOT</h1>
        <p class="subtitle">Co-op Tactical Combat</p>
        <div class="button-stack">
          <button class="primary" data-action="create">Create Room</button>
          <button class="secondary" data-action="join">Join Room</button>
        </div>
        <p class="version">v1.0 alpha</p>
      </div>
    `;

    el.querySelector('[data-action="create"]')!.addEventListener("click", () =>
      screens.show("createRoom")
    );
    el.querySelector('[data-action="join"]')!.addEventListener("click", () =>
      screens.show("joinRoom")
    );

    return el;
  }
}
