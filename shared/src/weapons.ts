export type WeaponId = "pistol" | "mk18" | "mg" | "bazooka" | "grenade";

export interface WeaponDef {
  id: WeaponId;
  name: string;
  fireRatePerSec: number;
  bulletSpeed: number;
  bulletLifetimeMs: number;
  bulletRadius: number;
  damage: number;
  rankRequired: number;
  ammo: number | "unlimited";
  spread: number;
  projectileColor: string;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: "pistol",
    name: "Pistol",
    fireRatePerSec: 3,
    bulletSpeed: 900,
    bulletLifetimeMs: 1000,
    bulletRadius: 4,
    damage: 5,
    rankRequired: 1,
    ammo: 30, // TODO: enforce limited starting ammo in Prompt 19
    spread: 0.02,
    projectileColor: "#FFD700",
  },
  mk18: {
    id: "mk18",
    name: "MK18",
    fireRatePerSec: 8,
    bulletSpeed: 1200,
    bulletLifetimeMs: 1200,
    bulletRadius: 4,
    damage: 10,
    rankRequired: 2,
    ammo: "unlimited",
    spread: 0.04,
    projectileColor: "#FFA500",
  },
  mg: {
    id: "mg",
    name: "Machine Gun",
    fireRatePerSec: 12,
    bulletSpeed: 1100,
    bulletLifetimeMs: 1200,
    bulletRadius: 5,
    damage: 12,
    rankRequired: 4,
    ammo: "unlimited",
    spread: 0.08,
    projectileColor: "#FF6347",
  },
  bazooka: {
    id: "bazooka",
    name: "Bazooka",
    fireRatePerSec: 0.5,
    bulletSpeed: 600,
    bulletLifetimeMs: 2000,
    bulletRadius: 8,
    damage: 40,
    rankRequired: 5,
    ammo: 3,
    spread: 0,
    projectileColor: "#8B0000",
  },
  grenade: {
    id: "grenade",
    name: "Grenade",
    fireRatePerSec: 1,
    bulletSpeed: 400,
    bulletLifetimeMs: 1500,
    bulletRadius: 6,
    damage: 50,
    rankRequired: 3,
    ammo: 3,
    spread: 0,
    projectileColor: "#556B2F",
  },
};
