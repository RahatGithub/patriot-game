import { PATRIOT_MAP } from "@patriot/shared";

/**
 * Check if a circle at (x, y) with given radius collides with any wall.
 * Uses circle-vs-AABB test.
 */
export function checkWallCollision(
  x: number,
  y: number,
  radius: number
): boolean {
  for (const wall of PATRIOT_MAP.walls) {
    // Find closest point on rectangle to circle center
    const cx = Math.max(wall.x, Math.min(x, wall.x + wall.width));
    const cy = Math.max(wall.y, Math.min(y, wall.y + wall.height));
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < radius * radius) {
      return true;
    }
  }
  return false;
}

/** Clamp position to map bounds accounting for player radius */
export function clampToMap(x: number, y: number, radius: number) {
  return {
    x: Math.max(radius, Math.min(PATRIOT_MAP.width - radius, x)),
    y: Math.max(radius, Math.min(PATRIOT_MAP.height - radius, y)),
  };
}
