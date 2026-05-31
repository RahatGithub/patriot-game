export type PlayerId = string;
export type RoomCode = string;
export type PlayerRank = "soldier" | "officer" | "major" | "general" | "marshal";

export const RANK_STARS: Record<PlayerRank, number> = {
  soldier: 1,
  officer: 2,
  major: 3,
  general: 4,
  marshal: 5,
};

export interface PlayerInfo {
  id: PlayerId;
  name: string;
  isCreator: boolean;
  joinedAt: number;
}

export interface RoomConfig {
  checkpointCount: 3 | 5 | 7;
}

export interface InputCommand {
  sequence: number;
  moveX: number;
  moveY: number;
  aimAngle: number;
  fire: boolean;
  timestamp: number;
}

export interface PlayerStateSnapshot {
  id: string;
  name: string;
  rank: string;
  x: number;
  y: number;
  aimAngle: number;
  hp: number;
  isDowned: boolean;
  lastProcessedInput: number;
}

// AI types
export type AIFaction = "patriot" | "mafia";
export type AIBehaviorState = "patrol" | "alert" | "chase" | "dead";

export interface PatrolWaypoint {
  x: number;
  y: number;
}

export interface PatrolPath {
  id: string;
  waypoints: PatrolWaypoint[];
  loop: boolean;
}

export interface AISpawnDef {
  spawnPointIndex: number;
  patrolPathId: string;
  weapon: "pistol" | "mk18" | "mg";
}

export interface LobbyState {
  code: RoomCode;
  creatorId: PlayerId;
  config: RoomConfig;
  players: PlayerInfo[];
  matchStarted: boolean;
}

export type MatchState = "lobby" | "starting" | "in_progress" | "ended";
export type MatchResult = "win" | "lose_wipe" | "lose_timeout" | null;

export type PickupType =
  | "cure"
  | "weapon_pistol"
  | "weapon_mk18"
  | "weapon_grenade"
  | "weapon_mg"
  | "weapon_bazooka"
  | "test";

export interface CrateDef {
  id: string;
  x: number;
  y: number;
  content: PickupType;
}

export interface BarrelDef {
  id: string;
  x: number;
  y: number;
}
