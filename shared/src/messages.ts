// Client → Server messages
export enum ClientMessage {
  START_MATCH = "START_MATCH",
}

// Server → Client messages
export enum ServerMessage {
  ROOM_FULL = "ROOM_FULL",
  NAME_TAKEN = "NAME_TAKEN",
  MATCH_STARTED = "MATCH_STARTED",
  ERROR = "ERROR",
}

// Payload shapes
export interface StartMatchPayload {}

export interface ErrorPayload {
  message: string;
}
