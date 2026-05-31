import type { Screen, ScreenContext } from "../ScreenManager.js";

export class LobbyScreen implements Screen {
  private disposed = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  render(ctx: ScreenContext): HTMLElement {
    const { screens, network } = ctx;
    const room = network.getRoom();

    if (!room) {
      screens.show("splash");
      return document.createElement("div");
    }

    const el = document.createElement("div");
    el.className = "screen";
    el.innerHTML = `
      <div class="card">
        <h2>LOBBY</h2>

        <div class="room-code-section">
          <span class="room-code" id="room-code">------</span>
          <button class="btn-small" id="btn-copy">Copy</button>
        </div>
        <div class="share-link" id="share-link"></div>

        <div class="player-list" id="player-list"></div>
        <div class="player-count" id="player-count">Players: 0 / 10</div>
        <div class="status-text" id="status-text"></div>

        <div class="button-group">
          <button class="danger" id="btn-leave">Leave Room</button>
          <button class="primary" id="btn-start" style="display:none" disabled>Start Match</button>
        </div>
      </div>
    `;

    const codeEl = el.querySelector("#room-code")!;
    const shareEl = el.querySelector("#share-link")!;
    const playerListEl = el.querySelector("#player-list")!;
    const countEl = el.querySelector("#player-count")!;
    const statusEl = el.querySelector("#status-text") as HTMLElement;
    const startBtn = el.querySelector("#btn-start") as HTMLButtonElement;
    const leaveBtn = el.querySelector("#btn-leave")!;
    const copyBtn = el.querySelector("#btn-copy")!;

    const updateUI = () => {
      if (this.disposed) return;
      const state = room.state as any;
      if (!state.code) return;

      // Check if match started via state
      if (state.matchStarted) {
        screens.show("matchStarting");
        return;
      }

      codeEl.textContent = state.code;
      shareEl.textContent = `Share: ${window.location.origin}/?room=${state.code}`;

      // Player list
      playerListEl.innerHTML = "";
      state.players.forEach((player: any, key: string) => {
        const item = document.createElement("div");
        item.className = "player-item" + (key === room.sessionId ? " local" : "");
        item.textContent =
          player.name + (player.isCreator ? " \uD83D\uDC51" : "");
        playerListEl.appendChild(item);
      });

      const size = state.players.size;
      countEl.textContent = `Players: ${size} / 10`;

      const isCreator = state.creatorId === room.sessionId;
      startBtn.style.display = isCreator ? "" : "none";
      startBtn.disabled = size < 2;

      if (isCreator) {
        statusEl.textContent =
          size < 2
            ? "You can start when 2+ players have joined"
            : "Ready to start!";
      } else {
        statusEl.textContent = "Waiting for room creator to start...";
      }
      statusEl.style.color = "";
    };

    // Listen for state changes
    room.onStateChange(updateUI);

    // Poll for initial state sync
    this.pollTimer = setInterval(() => {
      if ((room.state as any).code) {
        clearInterval(this.pollTimer!);
        this.pollTimer = null;
        updateUI();
      }
    }, 50);

    // Match started (via message or state change)
    room.onMessage("MATCH_STARTED", () => {
      if (!this.disposed) screens.show("matchStarting");
    });

    // Errors
    room.onMessage("ERROR", (data: any) => {
      if (this.disposed) return;
      statusEl.textContent = data.message || "An error occurred";
      statusEl.style.color = "#b22222";
      setTimeout(updateUI, 3000);
    });

    // Disconnected
    room.onLeave(() => {
      if (!this.disposed) screens.show("splash");
    });

    // Leave button
    leaveBtn.addEventListener("click", () => {
      this.disposed = true;
      network.leaveRoom();
      screens.show("splash");
    });

    // Start match button
    startBtn.addEventListener("click", () => {
      network.sendStartMatch();
    });

    // Copy code button
    copyBtn.addEventListener("click", async () => {
      const code = (room.state as any).code;
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code);
        copyBtn.textContent = "Copied!";
      } catch {
        // Fallback
        const range = document.createRange();
        range.selectNode(codeEl);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
        copyBtn.textContent = "Ctrl+C";
      }
      setTimeout(() => {
        copyBtn.textContent = "Copy";
      }, 1500);
    });

    return el;
  }

  dispose() {
    this.disposed = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
