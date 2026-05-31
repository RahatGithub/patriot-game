import { getDamage, BARREL_CHAIN_DELAY_MS } from "@patriot/shared";
import type { DamageSource } from "@patriot/shared";
import type { PatriotRoom } from "../rooms/PatriotRoom.js";

export interface AoEParams {
  source: DamageSource;
  x: number;
  y: number;
  radius: number;
  attackerId: string;
  attackerFaction: "player" | "ai";
  ignoreFriendlyFire: boolean;
}

export function applyAoE(room: PatriotRoom, params: AoEParams) {
  const radiusSq = params.radius * params.radius;

  // Damage players
  room.state.players.forEach((p, id) => {
    if (p.isDowned || p.isDead) return;
    const dx = p.x - params.x;
    const dy = p.y - params.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > radiusSq) return;

    // Friendly fire check: self-damage always applies, teammates skipped unless ignoreFriendlyFire
    const isAttackerHuman = params.attackerFaction === "player";
    const isSelf = id === params.attackerId;
    if (isAttackerHuman && !isSelf && !params.ignoreFriendlyFire) return;

    const falloff = 1.0 - Math.sqrt(distSq) / params.radius;
    const baseDmg = getDamage(params.source, "player");
    const dmg = Math.round(baseDmg * Math.max(0.4, falloff));

    room.applyAoEDamageToPlayer(p, id, dmg, params);
  });

  // Damage AI
  room.state.ai.forEach((ai, id) => {
    if (ai.isDead) return;
    const dx = ai.x - params.x;
    const dy = ai.y - params.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > radiusSq) return;

    // AI explosions don't damage other AI
    if (params.attackerFaction === "ai") return;

    const falloff = 1.0 - Math.sqrt(distSq) / params.radius;
    const baseDmg = getDamage(params.source, "player");
    const dmg = Math.round(baseDmg * Math.max(0.4, falloff));

    room.applyAoEDamageToAI(ai, id, dmg, params);
  });

  // Chain other barrels
  room.state.barrels.forEach((b, bId) => {
    if (b.exploded) return;
    const dx = b.x - params.x;
    const dy = b.y - params.y;
    if (dx * dx + dy * dy <= radiusSq) {
      setTimeout(() => {
        if (!b.exploded) room.explodeBarrel(bId, params.attackerId);
      }, BARREL_CHAIN_DELAY_MS);
    }
  });

  // Damage crates
  room.state.crates.forEach((c, cId) => {
    if (c.destroyed) return;
    const dx = c.x - params.x;
    const dy = c.y - params.y;
    if (dx * dx + dy * dy <= radiusSq) {
      const baseDmg = getDamage(params.source, "crate");
      c.hp = Math.max(0, c.hp - baseDmg);
      if (c.hp <= 0) room.destroyCratePublic(c, cId);
    }
  });
}
