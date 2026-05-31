import type { Screen, ScreenContext } from "../ScreenManager.js";
import { InputManager } from "../../input/InputManager.js";
import { InputDebugOverlay } from "../InputDebugOverlay.js";
import { getDebugFlag } from "../../utils/settings.js";

export class MatchStartingScreen implements Screen {
  private inputManager: InputManager | null = null;
  private debugOverlay: InputDebugOverlay | null = null;
  private f3Handler: ((e: KeyboardEvent) => void) | null = null;

  render(ctx: ScreenContext): HTMLElement {
    const { screens } = ctx;

    const el = document.createElement("div");
    el.className = "screen";
    // Allow pointer events to pass through to Phaser canvas for input testing
    el.style.pointerEvents = "none";
    el.innerHTML = `
      <div class="card" style="text-align:center">
        <h2>Match Starting...</h2>
        <div class="spinner"></div>
        <p class="subtitle">Get ready!</p>
      </div>
    `;

    // Initialize input system
    const game = screens.game;
    const profile = screens.deviceProfile;
    if (game && profile) {
      const scene = game.scene.getScene("BootScene");
      if (scene) {
        this.inputManager = new InputManager();
        this.inputManager.init(scene, profile);

        // Debug overlay (via URL ?debug=input or F3 toggle)
        if (getDebugFlag("input")) {
          this.showDebug();
        }

        this.f3Handler = (e: KeyboardEvent) => {
          if (e.key === "F3") {
            e.preventDefault();
            this.toggleDebug();
          }
        };
        window.addEventListener("keydown", this.f3Handler);
      }
    }

    return el;
  }

  private showDebug() {
    if (!this.debugOverlay && this.inputManager) {
      this.debugOverlay = new InputDebugOverlay(this.inputManager);
    }
  }

  private toggleDebug() {
    if (this.debugOverlay) {
      this.debugOverlay.destroy();
      this.debugOverlay = null;
    } else {
      this.showDebug();
    }
  }

  dispose() {
    this.debugOverlay?.destroy();
    this.debugOverlay = null;
    this.inputManager?.destroy();
    this.inputManager = null;
    if (this.f3Handler) {
      window.removeEventListener("keydown", this.f3Handler);
      this.f3Handler = null;
    }
  }
}
