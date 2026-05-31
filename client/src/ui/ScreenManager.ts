import { SplashScreen } from "./screens/SplashScreen.js";
import { CreateRoomScreen } from "./screens/CreateRoomScreen.js";
import { JoinRoomScreen } from "./screens/JoinRoomScreen.js";
import { LobbyScreen } from "./screens/LobbyScreen.js";
import { MatchStartingScreen } from "./screens/MatchStartingScreen.js";
import { DeviceSelectScreen } from "./screens/DeviceSelectScreen.js";
import { MatchEndScreen } from "./screens/MatchEndScreen.js";
import type { NetworkManager } from "../network/NetworkManager.js";
import type { DeviceProfile } from "../utils/deviceProfile.js";
import type Phaser from "phaser";

export interface ScreenContext {
  screens: ScreenManager;
  network: NetworkManager;
}

export interface Screen {
  render(ctx: ScreenContext, props?: any): HTMLElement;
  dispose?(): void;
}

export class ScreenManager {
  private overlay: HTMLElement;
  private currentScreen: Screen | null = null;
  private currentName = "";
  public network!: NetworkManager;
  public game!: Phaser.Game;
  public deviceProfile!: DeviceProfile;

  /** Stored for post-device-select routing */
  private pendingRoomCode: string | null = null;

  constructor(overlay: HTMLElement) {
    this.overlay = overlay;
  }

  show(name: string, props?: any) {
    this.currentScreen?.dispose?.();
    this.overlay.innerHTML = "";
    this.currentName = name;

    const screen = this.createScreen(name);
    const el = screen.render({ screens: this, network: this.network }, props);
    this.overlay.appendChild(el);
    this.currentScreen = screen;
  }

  hide() {
    this.currentScreen?.dispose?.();
    this.overlay.innerHTML = "";
    this.currentScreen = null;
    this.currentName = "";
  }

  current(): string {
    return this.currentName;
  }

  /** Called after device selection to navigate to the appropriate first screen */
  showPostDevice() {
    if (this.pendingRoomCode) {
      const code = this.pendingRoomCode;
      this.pendingRoomCode = null;
      this.show("joinRoom", { code });
    } else {
      this.show("splash");
    }
  }

  setPendingRoomCode(code: string) {
    this.pendingRoomCode = code;
  }

  private createScreen(name: string): Screen {
    switch (name) {
      case "splash":
        return new SplashScreen();
      case "createRoom":
        return new CreateRoomScreen();
      case "joinRoom":
        return new JoinRoomScreen();
      case "lobby":
        return new LobbyScreen();
      case "matchStarting":
        return new MatchStartingScreen();
      case "deviceSelect":
        return new DeviceSelectScreen();
      case "matchEnd":
        return new MatchEndScreen();
      default:
        throw new Error(`Unknown screen: ${name}`);
    }
  }
}
