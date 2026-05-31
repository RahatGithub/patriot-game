import type { Screen, ScreenContext } from "../ScreenManager.js";
import { setStoredProfile } from "../../utils/deviceProfile.js";

export class DeviceSelectScreen implements Screen {
  render(ctx: ScreenContext): HTMLElement {
    const { screens } = ctx;

    const el = document.createElement("div");
    el.className = "screen";
    el.innerHTML = `
      <div class="card" style="text-align:center">
        <h2>How are you playing?</h2>
        <div class="button-group" style="margin-top:20px">
          <button class="primary" data-action="desktop">
            &#x1f5a5;&#xfe0f; Desktop<br/>
            <small style="text-transform:none;font-weight:normal;opacity:0.7">Keyboard + Mouse</small>
          </button>
          <button class="primary" data-action="mobile">
            &#x1f4f1; Mobile<br/>
            <small style="text-transform:none;font-weight:normal;opacity:0.7">Touch Screen</small>
          </button>
        </div>
        <p class="version" style="margin-top:20px">You can change this later in settings</p>
      </div>
    `;

    el.querySelector('[data-action="desktop"]')!.addEventListener(
      "click",
      () => {
        setStoredProfile("desktop");
        screens.deviceProfile = "desktop";
        screens.showPostDevice();
      }
    );

    el.querySelector('[data-action="mobile"]')!.addEventListener(
      "click",
      () => {
        setStoredProfile("mobile");
        screens.deviceProfile = "mobile";
        screens.showPostDevice();
      }
    );

    return el;
  }
}
