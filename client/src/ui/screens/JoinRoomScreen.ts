import type { Screen, ScreenContext } from "../ScreenManager.js";

export class JoinRoomScreen implements Screen {
  render(ctx: ScreenContext, props?: { code?: string }): HTMLElement {
    const { screens, network } = ctx;
    const prefilled = props?.code || "";

    const el = document.createElement("div");
    el.className = "screen";
    el.innerHTML = `
      <div class="card">
        <h2>Join Room</h2>

        <label class="field-label" for="join-code">Room Code</label>
        <input type="text" id="join-code" maxlength="6" placeholder="ABC123"
               value="${prefilled}" ${prefilled ? "readonly" : ""} autocomplete="off" />
        <div class="error-msg" id="code-error"></div>

        <label class="field-label" for="join-name">Display Name</label>
        <input type="text" id="join-name" maxlength="20"
               placeholder="Enter your name..." autocomplete="off" />
        <div class="error-msg" id="join-error"></div>

        <div class="button-group">
          <button class="secondary" data-action="back">Back</button>
          <button class="primary" data-action="join">Join</button>
        </div>
      </div>
    `;

    const codeInput = el.querySelector("#join-code") as HTMLInputElement;
    const nameInput = el.querySelector("#join-name") as HTMLInputElement;
    const codeError = el.querySelector("#code-error")!;
    const joinError = el.querySelector("#join-error")!;
    const joinBtn = el.querySelector(
      '[data-action="join"]'
    ) as HTMLButtonElement;

    // Auto-uppercase code input
    codeInput.addEventListener("input", () => {
      codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    });

    el.querySelector('[data-action="back"]')!.addEventListener("click", () =>
      screens.show("splash")
    );

    joinBtn.addEventListener("click", async () => {
      const code = codeInput.value.trim().toUpperCase();
      const name = nameInput.value.trim();

      // Validate code
      if (!code || code.length !== 6) {
        codeError.textContent = "Enter a 6-character room code";
        return;
      }
      codeError.textContent = "";

      // Validate name
      if (!name) {
        joinError.textContent = "Name is required";
        return;
      }
      if (name.length > 20) {
        joinError.textContent = "Name must be 20 characters or fewer";
        return;
      }
      if (!/^[a-zA-Z0-9 ]+$/.test(name)) {
        joinError.textContent = "Only letters, numbers, and spaces allowed";
        return;
      }
      joinError.textContent = "";

      joinBtn.disabled = true;
      joinBtn.textContent = "Joining...";

      try {
        await network.joinRoom(code, name);
        screens.show("lobby");
      } catch (e: any) {
        const msg = e.message || "";
        if (msg.includes("NAME_TAKEN")) {
          joinError.textContent = "Name already taken in this room";
        } else if (msg.includes("ROOM_FULL")) {
          joinError.textContent = "Room is full (10 players max)";
        } else if (msg.includes("not found") || msg.includes("404")) {
          codeError.textContent = "Room not found";
        } else {
          joinError.textContent = msg || "Failed to join room";
        }
        joinBtn.disabled = false;
        joinBtn.textContent = "Join";
      }
    });

    // Focus appropriate input
    setTimeout(() => (prefilled ? nameInput : codeInput).focus(), 50);

    return el;
  }
}
