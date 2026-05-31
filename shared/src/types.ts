export type PlayerId = string;
export type RoomCode = string;

export interface PlayerInfo {
  id: PlayerId;
  name: string;
  isCreator: boolean;
  joinedAt: number;
}

export interface RoomConfig {
  checkpointCount: 3 | 5 | 7;
}

export interface LobbyState {
  code: RoomCode;
  creatorId: PlayerId;
  config: RoomConfig;
  players: PlayerInfo[];
  matchStarted: boolean;
}
