export type DamageSource =
  | "pistol_bullet"
  | "mk18_bullet"
  | "mg_bullet"
  | "grenade_explosion"
  | "bazooka_rocket"
  | "tank_cannon"
  | "barrel_explosion";

export type DamageTarget =
  | "player"
  | "jeep"
  | "truck"
  | "tank"
  | "barrel"
  | "crate";

/** 999 = instant destroy */
export const DAMAGE_MATRIX: Record<
  DamageSource,
  Record<DamageTarget, number>
> = {
  pistol_bullet: { player: 5, jeep: 2, truck: 2, tank: 1, barrel: 999, crate: 10 },
  mk18_bullet: { player: 10, jeep: 3, truck: 3, tank: 2, barrel: 999, crate: 20 },
  mg_bullet: { player: 12, jeep: 4, truck: 4, tank: 2, barrel: 999, crate: 20 },
  grenade_explosion: { player: 50, jeep: 20, truck: 20, tank: 15, barrel: 999, crate: 999 },
  bazooka_rocket: { player: 40, jeep: 40, truck: 40, tank: 40, barrel: 999, crate: 999 },
  tank_cannon: { player: 80, jeep: 80, truck: 80, tank: 40, barrel: 999, crate: 999 },
  barrel_explosion: { player: 60, jeep: 15, truck: 15, tank: 10, barrel: 999, crate: 999 },
};

export function getDamage(source: DamageSource, target: DamageTarget): number {
  return DAMAGE_MATRIX[source]?.[target] ?? 0;
}

export const PLAYER_MAX_HP = 100;
export const PLAYER_HITBOX_RADIUS = 22;
export const DOWNED_TIMEOUT_MS = 30_000;
