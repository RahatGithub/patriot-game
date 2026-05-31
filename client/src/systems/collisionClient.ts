import { PATRIOT_MAP } from "@patriot/shared";

/** Client-side collision check matching server logic */
export function checkWallCollisionClient(
  x: number,
  y: number,
  radius: number
): boolean {
  for (const wall of PATRIOT_MAP.walls) {
    const cx = Math.max(wall.x, Math.min(x, wall.x + wall.width));
    const cy = Math.max(wall.y, Math.min(y, wall.y + wall.height));
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < radius * radius) return true;
  }
  return false;
}
