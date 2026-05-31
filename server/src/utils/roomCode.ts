import { ROOM_CODE_CHARSET, ROOM_CODE_LENGTH } from "@patriot/shared";
import { hasCode } from "./roomRegistry.js";

export function generateRoomCode(length: number = ROOM_CODE_LENGTH): string {
  let code: string;
  do {
    code = "";
    for (let i = 0; i < length; i++) {
      code += ROOM_CODE_CHARSET[Math.floor(Math.random() * ROOM_CODE_CHARSET.length)];
    }
  } while (hasCode(code));
  return code;
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  for (const char of code) {
    if (!ROOM_CODE_CHARSET.includes(char)) return false;
  }
  return true;
}
