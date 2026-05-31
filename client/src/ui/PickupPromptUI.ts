import { WEAPONS } from "@patriot/shared";
import type { WeaponId } from "@patriot/shared";

const WEAPON_COLORS: Record<string, string> = {
  weapon_pistol: "#FFD700",
  weapon_mk18: "#FFA500",
  weapon_grenade: "#556B2F",
  weapon_mg: "#FF6347",
  weapon_bazooka: "#8B0000",
};

function getWeaponName(type: string): string {
  const id = type.replace("weapon_", "") as WeaponId;
  return WEAPONS[id]?.name ?? type;
}

export class PickupPromptUI {
  private el: HTMLElement | null = null;
  private currentPickupId = "";

  show(pickupId: string, type: string, screenX: number, screenY: number) {
    if (this.currentPickupId === pickupId && this.el) {
      // Just reposition
      this.el.style.left = `${screenX}px`;
      this.el.style.top = `${screenY - 80}px`;
      return;
    }

    this.hide();
    this.currentPickupId = pickupId;

    const name = getWeaponName(type);
    const borderColor = WEAPON_COLORS[type] || "#888";

    const el = document.createElement("div");
    el.id = "pickup-prompt";
    el.style.cssText = `
      position:fixed; left:${screenX}px; top:${screenY - 80}px;
      transform:translateX(-50%);
      background:rgba(0,0,0,0.85); border:2px solid ${borderColor}; border-radius:6px;
      padding:8px 16px; color:#fff; font-family:monospace; font-size:13px;
      z-index:1000; text-align:center; pointer-events:auto; white-space:nowrap;
    `;
    el.innerHTML = `
      <div style="font-weight:bold; margin-bottom:4px">Pick up ${name}?</div>
      <div style="font-size:11px; color:#aaa">
        <span style="color:#88ff88">[E]</span> Yes &nbsp;&nbsp;
        <span style="color:#ff8888">[N]</span> No
      </div>
    `;

    document.body.appendChild(el);
    this.el = el;
  }

  hide() {
    if (this.el) {
      this.el.remove();
      this.el = null;
      this.currentPickupId = "";
    }
  }

  get visible() {
    return this.el !== null;
  }

  get activePickupId() {
    return this.currentPickupId;
  }
}
