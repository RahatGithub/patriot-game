import type { Screen, ScreenContext } from "../ScreenManager.js";

export class MatchEndScreen implements Screen {
  render(ctx: ScreenContext, props?: any): HTMLElement {
    const { screens } = ctx;
    const result: string = props?.result || "lose_timeout";

    let title = "";
    let subtitle = "";
    let titleColor = "#ff4444";

    switch (result) {
      case "win":
        title = "MISSION ACCOMPLISHED";
        subtitle = "All checkpoints secured. Outstanding work, soldier.";
        titleColor = "#44cc44";
        break;
      case "lose_timeout":
        title = "TIME UP";
        subtitle = "The mission clock ran out. Regroup and try again.";
        titleColor = "#ff8844";
        break;
      case "lose_wipe":
        title = "MISSION FAILED";
        subtitle = "All operatives down. The enemy holds the field.";
        titleColor = "#ff4444";
        break;
    }

    const el = document.createElement("div");
    el.className = "screen";
    el.innerHTML = `
      <div class="card" style="text-align:center; max-width:500px">
        <h1 style="color:${titleColor}; font-size:36px; margin-bottom:8px">${title}</h1>
        <p class="subtitle" style="margin-bottom:24px">${subtitle}</p>
        <p style="color:#888; font-size:13px; margin-bottom:20px">Detailed stats coming soon...</p>
        <div class="button-stack">
          <button class="primary" data-action="lobby">Back to Lobby</button>
        </div>
      </div>
    `;

    el.querySelector('[data-action="lobby"]')!.addEventListener("click", () => {
      screens.game.events.emit("leaveMatch");
    });

    return el;
  }
}
