import type { Screen, ScreenContext } from "../ScreenManager.js";

export class MatchStartingScreen implements Screen {
  private readyHandler: (() => void) | null = null;
  private game: Phaser.Game | null = null;

  render(ctx: ScreenContext): HTMLElement {
    const { screens } = ctx;
    const game = screens.game;
    this.game = game;

    const el = document.createElement("div");
    el.className = "screen";
    el.innerHTML = `
      <div class="card" style="text-align:center">
        <h2>Loading map...</h2>
        <div class="spinner"></div>
        <p class="subtitle">Preparing battlefield</p>
      </div>
    `;

    if (game) {
      const profile = screens.deviceProfile;

      // Listen for game scene ready
      this.readyHandler = () => {
        // Hide the HTML overlay — reveals the game canvas
        screens.hide();
        // Launch HUD scene in parallel
        game.scene.start("HUDScene");
      };
      game.events.once("gameSceneReady", this.readyHandler);

      // Start GameScene (replaces BootScene)
      setTimeout(() => {
        game.scene.start("GameScene", { deviceProfile: profile });
      }, 100);
    }

    return el;
  }

  dispose() {
    if (this.readyHandler && this.game) {
      this.game.events.off("gameSceneReady", this.readyHandler);
      this.readyHandler = null;
    }
    this.game = null;
  }
}
