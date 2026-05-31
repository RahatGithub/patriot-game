/**
 * Patriot Map Definition — shared between client and server.
 * Coordinate system: Y-down (positive Y = downward on screen), standard Phaser convention.
 * All units in pixels.
 *
 * Layout (approximate):
 *
 *   0        1200   2200  2400      3500  3800  4000
 * 0 +--------+------+-----+---------+-----+-----+
 *   | Out-1  | Pool |     | Indoor  |     |     |
 *   | (grass)|      |     | (mafia) |     |     |
 *   |        |      |     |         |     |     |
 *   |        +------+     |         |     |     |
 * 800        | Outdoor 2  |         |     |     |
 *   |  CP1   | (dirt road)|  CP4    |     |     |
 *   |[SPAWN] |   CP2      |         |     |     |
 *1500+--------+   CP3     +---------+     |     |
 *   |        |            |               |     |
 *1800        |            +---------------+-----+
 *   |        |            | Basement            |
 *   |        |            |  CP5  CP6  CP7      |
 *2200        +------------+                     |
 *2900                     +---------------------+
 *3000+------------------------------------------+
 */

export interface MapZone {
  id: string;
  name: string;
  type: "outdoor" | "indoor" | "basement" | "pool";
  bounds: { x: number; y: number; width: number; height: number };
  floorColor: string;
}

export interface MapWall {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CheckpointDef {
  id: string;
  position: { x: number; y: number };
  radius: number;
  order: number;
}

export interface SpawnZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

import type { PatrolPath, AISpawnDef } from "./types.js";

export interface MapDefinition {
  width: number;
  height: number;
  zones: MapZone[];
  walls: MapWall[];
  checkpoints: CheckpointDef[];
  playerSpawn: SpawnZone;
  enemySpawnPoints: { x: number; y: number }[];
  waterPools: { x: number; y: number; width: number; height: number }[];
  patrolPaths: PatrolPath[];
  initialAISpawns: AISpawnDef[];
}

export const PATRIOT_MAP: MapDefinition = {
  width: 4000,
  height: 3000,

  zones: [
    {
      id: "outdoor1",
      name: "Spawn Area",
      type: "outdoor",
      bounds: { x: 0, y: 0, width: 1200, height: 1500 },
      floorColor: "#3a5f3a",
    },
    {
      id: "pool",
      name: "Pool Area",
      type: "pool",
      bounds: { x: 1200, y: 0, width: 1000, height: 800 },
      floorColor: "#5a5a5a",
    },
    {
      id: "outdoor2",
      name: "Central Road",
      type: "outdoor",
      bounds: { x: 1200, y: 800, width: 1200, height: 1400 },
      floorColor: "#7a6a4a",
    },
    {
      id: "indoor",
      name: "Mafia Hideout",
      type: "indoor",
      bounds: { x: 2400, y: 200, width: 1100, height: 1300 },
      floorColor: "#4a4a4a",
    },
    {
      id: "basement",
      name: "Underground",
      type: "basement",
      bounds: { x: 2400, y: 1800, width: 1400, height: 1100 },
      floorColor: "#2a2a2a",
    },
  ],

  walls: [
    // === Perimeter ===
    { x: 0, y: 0, width: 4000, height: 20 },
    { x: 0, y: 2980, width: 4000, height: 20 },
    { x: 0, y: 0, width: 20, height: 3000 },
    { x: 3980, y: 0, width: 20, height: 3000 },

    // === Indoor building outer walls ===
    { x: 2400, y: 200, width: 1100, height: 20 },
    { x: 2400, y: 200, width: 20, height: 500 },
    { x: 2400, y: 800, width: 20, height: 700 },
    { x: 3500, y: 200, width: 20, height: 1300 },
    { x: 2400, y: 1500, width: 1120, height: 20 },

    // === Indoor interior walls ===
    { x: 2800, y: 200, width: 20, height: 400 },
    { x: 2800, y: 700, width: 20, height: 300 },
    { x: 2400, y: 900, width: 300, height: 20 },
    { x: 3100, y: 700, width: 400, height: 20 },
    { x: 3100, y: 1100, width: 20, height: 400 },

    // === Pool area borders ===
    { x: 1200, y: 0, width: 20, height: 300 },
    { x: 1200, y: 400, width: 20, height: 400 },
    { x: 2200, y: 0, width: 20, height: 800 },
    { x: 1200, y: 800, width: 1020, height: 20 },

    // === Basement walls ===
    { x: 2400, y: 1800, width: 1400, height: 20 },
    { x: 2400, y: 1800, width: 20, height: 400 },
    { x: 2400, y: 2300, width: 20, height: 600 },
    { x: 3800, y: 1800, width: 20, height: 1100 },
    { x: 2400, y: 2900, width: 1420, height: 20 },
    { x: 3000, y: 1800, width: 20, height: 500 },
    { x: 3000, y: 2400, width: 20, height: 500 },
    { x: 2400, y: 2400, width: 400, height: 20 },

    // === Outdoor cover ===
    { x: 500, y: 600, width: 120, height: 20 },
    { x: 800, y: 400, width: 20, height: 120 },
    { x: 300, y: 900, width: 150, height: 20 },
    { x: 900, y: 1100, width: 20, height: 100 },
    { x: 600, y: 300, width: 100, height: 20 },

    // === Road barriers ===
    { x: 1500, y: 1000, width: 100, height: 20 },
    { x: 1800, y: 1200, width: 20, height: 100 },
    { x: 1600, y: 1500, width: 120, height: 20 },
    { x: 2000, y: 1800, width: 150, height: 20 },
    { x: 1400, y: 2000, width: 20, height: 150 },
    { x: 1700, y: 1700, width: 80, height: 20 },
    { x: 2100, y: 1400, width: 20, height: 120 },
  ],

  checkpoints: [
    { id: "cp1", position: { x: 600, y: 800 }, radius: 120, order: 1 },
    { id: "cp2", position: { x: 1700, y: 1300 }, radius: 120, order: 2 },
    { id: "cp3", position: { x: 1600, y: 600 }, radius: 120, order: 3 },
    { id: "cp4", position: { x: 3000, y: 900 }, radius: 120, order: 4 },
    { id: "cp5", position: { x: 2700, y: 2100 }, radius: 120, order: 5 },
    { id: "cp6", position: { x: 3200, y: 2500 }, radius: 120, order: 6 },
    { id: "cp7", position: { x: 3600, y: 2700 }, radius: 120, order: 7 },
  ],

  playerSpawn: { x: 200, y: 1200, width: 200, height: 200 },

  enemySpawnPoints: [
    { x: 50, y: 50 },
    { x: 1000, y: 50 },
    { x: 2000, y: 50 },
    { x: 3900, y: 100 },
    { x: 3900, y: 500 },
    { x: 3900, y: 1000 },
    { x: 3900, y: 1500 },
    { x: 3900, y: 2000 },
    { x: 3900, y: 2500 },
    { x: 3900, y: 2900 },
    { x: 3000, y: 2950 },
    { x: 2000, y: 2950 },
    { x: 1000, y: 2950 },
    { x: 50, y: 2900 },
    { x: 50, y: 2000 },
    { x: 50, y: 1500 },
    { x: 50, y: 500 },
    { x: 1200, y: 50 },
    { x: 2400, y: 50 },
    { x: 3500, y: 2950 },
  ],

  waterPools: [
    { x: 1350, y: 150, width: 350, height: 250 },
    { x: 1850, y: 350, width: 200, height: 200 },
    { x: 1450, y: 550, width: 150, height: 120 },
  ],

  patrolPaths: [
    // Outdoor 1 paths
    { id: "p1", loop: true, waypoints: [{ x: 600, y: 200 }, { x: 900, y: 200 }, { x: 900, y: 500 }, { x: 600, y: 500 }] },
    { id: "p2", loop: false, waypoints: [{ x: 200, y: 600 }, { x: 500, y: 600 }, { x: 500, y: 900 }, { x: 200, y: 900 }] },
    // Pool area paths
    { id: "p3", loop: true, waypoints: [{ x: 1300, y: 100 }, { x: 1700, y: 100 }, { x: 1700, y: 700 }, { x: 1300, y: 700 }] },
    { id: "p4", loop: false, waypoints: [{ x: 1900, y: 150 }, { x: 2100, y: 150 }, { x: 2100, y: 600 }] },
    // Indoor building paths
    { id: "p5", loop: true, waypoints: [{ x: 2500, y: 300 }, { x: 2700, y: 300 }, { x: 2700, y: 600 }, { x: 2500, y: 600 }] },
    { id: "p6", loop: false, waypoints: [{ x: 2900, y: 300 }, { x: 3400, y: 300 }, { x: 3400, y: 600 }, { x: 2900, y: 600 }] },
    { id: "p7", loop: true, waypoints: [{ x: 2500, y: 1000 }, { x: 2700, y: 1000 }, { x: 2700, y: 1400 }, { x: 2500, y: 1400 }] },
    // Outdoor 2 paths
    { id: "p8", loop: false, waypoints: [{ x: 1400, y: 900 }, { x: 1800, y: 900 }, { x: 1800, y: 1200 }] },
    { id: "p9", loop: true, waypoints: [{ x: 1500, y: 1600 }, { x: 2000, y: 1600 }, { x: 2000, y: 2000 }, { x: 1500, y: 2000 }] },
    // Basement paths
    { id: "p10", loop: true, waypoints: [{ x: 2500, y: 1900 }, { x: 2900, y: 1900 }, { x: 2900, y: 2300 }, { x: 2500, y: 2300 }] },
    { id: "p11", loop: false, waypoints: [{ x: 3100, y: 1900 }, { x: 3700, y: 1900 }, { x: 3700, y: 2800 }, { x: 3100, y: 2800 }] },
    { id: "p12", loop: true, waypoints: [{ x: 2600, y: 2500 }, { x: 3000, y: 2500 }, { x: 3000, y: 2800 }, { x: 2600, y: 2800 }] },
  ],

  initialAISpawns: [
    { spawnPointIndex: 0, patrolPathId: "p1", weapon: "mk18" },
    { spawnPointIndex: 1, patrolPathId: "p2", weapon: "pistol" },
    { spawnPointIndex: 2, patrolPathId: "p3", weapon: "mk18" },
    { spawnPointIndex: 3, patrolPathId: "p4", weapon: "pistol" },
    { spawnPointIndex: 4, patrolPathId: "p5", weapon: "mk18" },
    { spawnPointIndex: 5, patrolPathId: "p6", weapon: "mk18" },
    { spawnPointIndex: 6, patrolPathId: "p7", weapon: "pistol" },
    { spawnPointIndex: 7, patrolPathId: "p8", weapon: "mk18" },
    { spawnPointIndex: 8, patrolPathId: "p9", weapon: "mg" },
    { spawnPointIndex: 9, patrolPathId: "p10", weapon: "mk18" },
    { spawnPointIndex: 10, patrolPathId: "p11", weapon: "mg" },
    { spawnPointIndex: 11, patrolPathId: "p12", weapon: "mk18" },
  ],
};
