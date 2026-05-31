import type { Screen, ScreenContext } from "../ScreenManager.js";

const RANK_STARS: Record<string, number> = {
  soldier: 1,
  officer: 2,
  major: 3,
  general: 4,
  marshal: 5,
};

export class MatchEndScreen implements Screen {
  render(ctx: ScreenContext, props?: any): HTMLElement {
    const { screens } = ctx;
    const result: string = props?.result || "lose_timeout";
    const finalStats: any = props?.finalStats || null;

    let title = "";
    let subtitle = "";
    let titleColor = "#ff4444";

    switch (result) {
      case "win":
        title = "MISSION ACCOMPLISHED";
        subtitle = "Squad survived. All checkpoints taken.";
        titleColor = "#44cc44";
        break;
      case "lose_timeout":
        title = "TIME UP";
        subtitle = "Time ran out. The mafia held their ground.";
        titleColor = "#ff8844";
        break;
      case "lose_wipe":
        title = "MISSION FAILED";
        subtitle = "Squad eliminated. The mafia prevailed.";
        titleColor = "#ff4444";
        break;
    }

    // Format match duration
    let durationStr = "--:--";
    if (finalStats?.matchDurationMs) {
      const totalSec = Math.floor(finalStats.matchDurationMs / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      durationStr = `${min}:${String(sec).padStart(2, "0")}`;
    }

    // Squad stats
    const capturedCount = finalStats?.capturedCount ?? 0;
    const totalCheckpoints = finalStats?.totalCheckpoints ?? 0;
    const totalAIKilled = finalStats?.totalAIKilled ?? 0;
    const totalAISpawned = finalStats?.totalAISpawned ?? 0;
    const players: any[] = finalStats?.players ?? [];
    const totalKills = players.reduce((a: number, b: any) => a + b.kills, 0);

    // MVP is first in sorted array (sorted by kills desc, then damageDealt desc)
    const mvpName = players.length > 0 && players[0].kills > 0 ? players[0].name : "";

    // Build player rows
    let playerRows = "";
    players.forEach((p: any, i: number) => {
      const isMvp = p.name === mvpName && p.kills > 0;
      const stars = "\u2605".repeat(RANK_STARS[p.rank] ?? 1);
      const crown = isMvp ? '<span style="color:#ffd700">\uD83D\uDC51</span>' : "";
      const rowStyle = isMvp ? 'style="color:#ffd700; background:rgba(255,215,0,0.08)"' : "";
      const delay = i * 50;
      playerRows += `
        <tr ${rowStyle} class="stats-row" style="animation: rowFadeIn 0.4s ease-out ${delay}ms both; ${isMvp ? "color:#ffd700; background:rgba(255,215,0,0.08)" : ""}">
          <td style="text-align:left; padding:4px 8px">${crown}${p.name}</td>
          <td style="padding:4px 6px">${stars}</td>
          <td style="padding:4px 6px">${p.kills}</td>
          <td style="padding:4px 6px">${p.deaths}</td>
          <td style="padding:4px 6px">${p.damageDealt}</td>
          <td style="padding:4px 6px">${p.checkpointsCaptured}</td>
        </tr>
      `;
    });

    const el = document.createElement("div");
    el.className = "screen";
    el.innerHTML = `
      <style>
        @keyframes rowFadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .stats-table { width:100%; border-collapse:collapse; font-family:monospace; font-size:14px; color:#ccc; }
        .stats-table th { color:#888; font-weight:normal; font-size:11px; text-transform:uppercase; padding:4px 6px; border-bottom:1px solid #444; }
        .stats-table td { border-bottom:1px solid #333; }
        .squad-block { background:rgba(255,255,255,0.05); border:1px solid #444; border-radius:6px; padding:10px 16px; margin:12px auto; max-width:360px; font-family:monospace; font-size:13px; color:#aaa; text-align:left; line-height:1.8; }
        .squad-block span { color:#fff; float:right; }
      </style>
      <div class="card" style="text-align:center; max-width:520px; animation: fadeInStats 0.5s ease-out">
        <h1 style="color:${titleColor}; font-size:32px; margin-bottom:6px">${title}</h1>
        <p class="subtitle" style="margin-bottom:16px; font-size:14px">${subtitle}</p>

        <div class="squad-block">
          <div>Checkpoints captured <span>${capturedCount}/${totalCheckpoints}</span></div>
          <div>Total kills <span>${totalKills}</span></div>
          <div>Match duration <span>${durationStr}</span></div>
          <div>Enemies eliminated <span>${totalAIKilled}/${totalAISpawned}</span></div>
        </div>

        ${players.length > 0 ? `
        <div style="overflow-x:auto; margin:12px 0">
          <table class="stats-table">
            <thead>
              <tr>
                <th style="text-align:left">Player</th>
                <th>Rank</th>
                <th>K</th>
                <th>D</th>
                <th>DMG</th>
                <th>CP</th>
              </tr>
            </thead>
            <tbody>
              ${playerRows}
            </tbody>
          </table>
        </div>
        ${mvpName ? `<p style="color:#ffd700; font-size:14px; margin:8px 0">\uD83D\uDC51 MVP: ${mvpName} (${players[0].kills} kills)</p>` : ""}
        ` : ""}

        <div class="button-stack" style="margin-top:16px">
          <button class="primary" data-action="lobby">Back to Lobby</button>
        </div>
      </div>
    `;

    // Inject keyframes
    if (!document.getElementById("endscreen-style")) {
      const style = document.createElement("style");
      style.id = "endscreen-style";
      style.textContent = `@keyframes fadeInStats { from { opacity:0; transform:translateY(15px); } to { opacity:1; transform:translateY(0); } }`;
      document.head.appendChild(style);
    }

    el.querySelector('[data-action="lobby"]')!.addEventListener("click", () => {
      screens.game.events.emit("leaveMatch");
    });

    return el;
  }
}
