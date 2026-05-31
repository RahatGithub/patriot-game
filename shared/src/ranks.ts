export type RankId = "soldier" | "officer" | "major" | "general" | "marshal";

export interface RankDef {
  id: RankId;
  name: string;
  stars: number;
  killThreshold: number;
  spriteKey: string;
}

export const RANKS: RankDef[] = [
  { id: "soldier",  name: "Soldier",       stars: 1, killThreshold: 0,  spriteKey: "soldier_patriot" },
  { id: "officer",  name: "Officer",       stars: 2, killThreshold: 10, spriteKey: "officer_patriot" },
  { id: "major",    name: "Major",         stars: 3, killThreshold: 25, spriteKey: "major_patriot" },
  { id: "general",  name: "General",       stars: 4, killThreshold: 50, spriteKey: "general_patriot" },
  { id: "marshal",  name: "Field Marshal", stars: 5, killThreshold: 80, spriteKey: "marshal_patriot" },
];

export const RANK_TINTS: Record<RankId, number | null> = {
  soldier: null,
  officer: 0xccddff,
  major: 0xccffcc,
  general: 0xffe0aa,
  marshal: 0xffee88,
};

export function getRankForKills(kills: number): RankDef {
  let current = RANKS[0];
  for (const r of RANKS) {
    if (kills >= r.killThreshold) current = r;
  }
  return current;
}

export function getNextRank(currentRankId: RankId): RankDef | null {
  const idx = RANKS.findIndex((r) => r.id === currentRankId);
  if (idx === -1 || idx === RANKS.length - 1) return null;
  return RANKS[idx + 1];
}

export function getKillsToNextRank(kills: number, currentRankId: RankId): number {
  const next = getNextRank(currentRankId);
  if (!next) return 0;
  return Math.max(0, next.killThreshold - kills);
}
