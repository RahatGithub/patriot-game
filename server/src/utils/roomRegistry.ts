import type { RoomCode } from "@patriot/shared";

const codeToRoomId = new Map<RoomCode, string>();

export function registerRoom(code: RoomCode, roomId: string): void {
  codeToRoomId.set(code, roomId);
}

export function unregisterRoom(code: RoomCode): void {
  codeToRoomId.delete(code);
}

export function getRoomIdByCode(code: RoomCode): string | undefined {
  return codeToRoomId.get(code);
}

export function hasCode(code: RoomCode): boolean {
  return codeToRoomId.has(code);
}
