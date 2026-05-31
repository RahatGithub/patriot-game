import type { Screen, ScreenContext } from "../ScreenManager.js";

export class CreateRoomScreen implements Screen {
  render(ctx: ScreenContext): HTMLElement {
    const { screens, network } = ctx;

    const el = document.createElement("div");
    el.className = "screen";
    el.innerHTML = `
      <div class="card">
        <h2>Create Room</h2>

        <label class="field-label" for="create-name">Display Name</label>
        <input type="text" id="create-name" maxlength="20"
               placeholder="Enter your name..." autocomplete="off" />
        <div class="error-msg" id="name-error"></div>

        <label class="field-label">Checkpoints</label>
        <div class="radio-group">
          <label><input type="radio" name="cp" value="3" checked /> 3</label>
          <label><input type="radio" name="cp" value="5" /> 5</label>
          <label><input type="radio" name="cp" value="7" /> 7</label>
        </div>

        <label class="field-label">Character</label>
        <div class="character-preview" id="char-preview"></div>

        <div class="error-msg" id="create-error"></div>

        <div class="button-group">
          <button class="secondary" data-action="back">Back</button>
          <button class="primary" data-action="create">Create</button>
        </div>
      </div>
    `;

    // Character preview: try loading sprite, fall back to placeholder
    const previewContainer = el.querySelector("#char-preview")!;
    const img = document.createElement("img");
    img.src = "/assets/sprites/characters/soldier_patriot.png";
    img.alt = "Soldier";
    img.onerror = () => {
      previewContainer.innerHTML = '<div class="char-placeholder">Soldier</div>';
    };
    previewContainer.appendChild(img);

    const nameInput = el.querySelector("#create-name") as HTMLInputElement;
    const nameError = el.querySelector("#name-error")!;
    const createError = el.querySelector("#create-error")!;
    const createBtn = el.querySelector(
      '[data-action="create"]'
    ) as HTMLButtonElement;

    el.querySelector('[data-action="back"]')!.addEventListener("click", () =>
      screens.show("splash")
    );

    createBtn.addEventListener("click", async () => {
      const name = nameInput.value.trim();

      if (!name) {
        nameError.textContent = "Name is required";
        return;
      }
      if (name.length > 20) {
        nameError.textContent = "Name must be 20 characters or fewer";
        return;
      }
      if (!/^[a-zA-Z0-9 ]+$/.test(name)) {
        nameError.textContent = "Only letters, numbers, and spaces allowed";
        return;
      }
      nameError.textContent = "";

      const cp = parseInt(
        (
          el.querySelector(
            'input[name="cp"]:checked'
          ) as HTMLInputElement
        ).value
      );

      createBtn.disabled = true;
      createBtn.textContent = "Creating...";
      createError.textContent = "";

      try {
        await network.createRoom(name, cp);
        screens.show("lobby");
      } catch (e: any) {
        createError.textContent = e.message || "Failed to create room";
        createBtn.disabled = false;
        createBtn.textContent = "Create";
      }
    });

    // Focus name input
    setTimeout(() => nameInput.focus(), 50);

    return el;
  }
}
