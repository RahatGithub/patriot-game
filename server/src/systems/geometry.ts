import type { MapWall } from "@patriot/shared";

/**
 * Check if a line segment (x1,y1)→(x2,y2) intersects an axis-aligned rectangle.
 * Uses the Liang-Barsky algorithm.
 */
export function segmentIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: MapWall
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;

  const p = [-dx, dx, -dy, dy];
  const q = [
    x1 - rect.x,
    rect.x + rect.width - x1,
    y1 - rect.y,
    rect.y + rect.height - y1,
  ];

  let tMin = 0;
  let tMax = 1;

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false; // parallel and outside
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        tMin = Math.max(tMin, t);
      } else {
        tMax = Math.min(tMax, t);
      }
      if (tMin > tMax) return false;
    }
  }

  return true;
}
