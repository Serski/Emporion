import type { Content } from "../content/load.js";
import { costAt, curveAt } from "../content/curves.js";
import { canAfford, pay } from "../core/resources.js";
import { fail, ok, type Result } from "../core/result.js";
import { DAY, scaledMs } from "../core/time.js";
import type { GameState, Hero, HeroPoints, Ms, Player, Resources } from "../core/types.js";
import type { HeroInBattle } from "../military/combat.js";
import { touchId } from "../village/timeline.js";
import { effectFactor, firstBuildingWith } from "../village/stats.js";

// ---------------------------------------------------------------------------
// The hero: one per player. Marches with an army (adding fighting strength and
// an offence or defence bonus), earns experience from enemy losses, spends
// attribute points, produces resources for its home town, annexes oases, and
// is revived at home after it falls.
// ---------------------------------------------------------------------------

export function heroAlive(hero: Hero | null | undefined): hero is Hero {
  return !!hero && hero.status !== "dead" && hero.status !== "reviving";
}

export function heroHealth(state: GameState, content: Content, hero: Hero, t: Ms): number {
  if (!heroAlive(hero)) return 0;
  const regen = (content.hero.healthRegenPerDay * state.settings.speed * Math.max(0, t - hero.healthAt)) / DAY;
  return Math.min(100, hero.health + regen);
}

function settleHealth(state: GameState, content: Content, hero: Hero, t: Ms) {
  hero.health = heroHealth(state, content, hero, t);
  hero.healthAt = t;
}

export function heroInBattle(content: Content, hero: Hero): HeroInBattle {
  const h = content.hero;
  return {
    strength: h.strength.base + h.strength.perPoint * hero.points.strength,
    offenseBonus: h.offensePerPoint * hero.points.offense,
    defenseBonus: h.defensePerPoint * hero.points.defense,
  };
}

export function xpForLevel(content: Content, level: number): number {
  return (content.hero.xpBase * level * (level + 1)) / 2;
}

// Add experience; returns the levels gained (each grants pointsPerLevel).
export function grantXp(content: Content, hero: Hero, xp: number): number {
  if (xp <= 0) return 0;
  hero.xp += xp;
  let gained = 0;
  while (hero.level < content.hero.maxLevel && hero.xp >= xpForLevel(content, hero.level + 1)) {
    hero.level++;
    hero.unspent += content.hero.pointsPerLevel;
    gained++;
  }
  return gained;
}

// Apply battle damage at a side's loss rate. Returns health lost and whether the hero fell.
export function woundHero(state: GameState, content: Content, player: Player, lossRate: number, t: Ms): { lost: number; died: boolean } {
  const hero = player.hero;
  if (!heroAlive(hero)) return { lost: 0, died: false };
  settleHealth(state, content, hero, t);
  const lost = Math.min(hero.health, Math.round(lossRate * 100 * content.hero.damageFactor));
  hero.health -= lost;
  if (hero.health <= 0 || lossRate >= 1) {
    // The hero's production stops: settle the home town first.
    touchId(state, content, hero.homeVillageId, t);
    hero.health = 0;
    hero.status = "dead";
    hero.where = null;
    return { lost, died: true };
  }
  return { lost, died: false };
}

export function assignHeroPoints(state: GameState, content: Content, playerId: string, add: Partial<HeroPoints>, now: Ms): Result {
  const player = state.players[playerId];
  const hero = player?.hero;
  if (!player || !hero) return fail("not_found", "You have no hero.");
  let total = 0;
  for (const v of Object.values(add)) {
    if (!Number.isInteger(v) || (v ?? 0) < 0) return fail("invalid", "Points are whole and positive.");
    total += v ?? 0;
  }
  if (total === 0) return fail("invalid", "Assign at least one point.");
  if (total > hero.unspent) return fail("insufficient", `Only ${hero.unspent} points to spend.`);
  const cap = 100;
  for (const [k, v] of Object.entries(add) as [keyof HeroPoints, number][]) {
    if (hero.points[k] + v > cap) return fail("max_level", `${k} cannot exceed ${cap}.`);
  }
  touchId(state, content, hero.homeVillageId, now); // production may change
  for (const [k, v] of Object.entries(add) as [keyof HeroPoints, number][]) hero.points[k] += v;
  hero.unspent -= total;
  return ok({});
}

export function setHeroProduction(state: GameState, content: Content, playerId: string, resource: string, now: Ms): Result {
  const hero = state.players[playerId]?.hero;
  if (!hero) return fail("not_found", "You have no hero.");
  if (resource !== "all" && !content.resourceIds.includes(resource)) return fail("invalid", "Unknown resource.");
  touchId(state, content, hero.homeVillageId, now);
  hero.productionResource = resource;
  return ok({});
}

export function reviveCost(content: Content, hero: Hero): Resources {
  return costAt(content.hero.revive.cost, Math.max(1, hero.level));
}

export function reviveMs(state: GameState, content: Content, hero: Hero): Ms {
  const home = state.villages[hero.homeVillageId];
  const shrine = home ? firstBuildingWith(content, home, (d) => !!d.effects.heroRevive) : null;
  const factor = home && shrine ? effectFactor(content, home, shrine.def.id, "heroRevive") : 1;
  return scaledMs(state, curveAt(content.hero.revive.time, hero.level) * factor);
}

export function reviveHero(state: GameState, content: Content, playerId: string, now: Ms): Result<{ reviveAt: Ms }> {
  const player = state.players[playerId];
  const hero = player?.hero;
  if (!player || !hero) return fail("not_found", "You have no hero.");
  if (hero.status !== "dead") return fail("invalid", "Your hero is not dead.");
  const home = touchId(state, content, hero.homeVillageId, now);
  if (!home || home.ownerId !== playerId) {
    // The home town was lost: revive in the capital.
    if (!player.capitalId) return fail("not_found", "You have no town to revive your hero in.");
    hero.homeVillageId = player.capitalId;
  }
  const v = touchId(state, content, hero.homeVillageId, now)!;
  const cost = reviveCost(content, hero);
  if (!canAfford(v.resources, cost)) return fail("insufficient", "Not enough resources to revive your hero.");
  pay(v.resources, cost);
  hero.status = "reviving";
  hero.reviveAt = now + reviveMs(state, content, hero);
  return ok({ reviveAt: hero.reviveAt });
}

// Make the town where the hero is stationed (one of the player's own, reached
// by a reinforcement march) its new home.
export function moveHeroHome(state: GameState, content: Content, playerId: string, villageId: string, now: Ms): Result {
  const player = state.players[playerId];
  const hero = player?.hero;
  if (!player || !hero) return fail("not_found", "You have no hero.");
  const v = state.villages[villageId];
  if (!v || v.ownerId !== playerId) return fail("not_owner", "That town is not yours.");
  if (hero.status !== "stationed" || hero.where !== `v:${villageId}`) {
    return fail("invalid", "Send your hero to that town as reinforcement first.");
  }
  touchId(state, content, hero.homeVillageId, now);
  touchId(state, content, villageId, now);
  const group = v.stationed.find((s) => s.ownerId === playerId && s.hero);
  if (group) group.hero = false;
  v.stationed = v.stationed.filter((s) => s.hero || Object.keys(s.troops).length > 0);
  hero.homeVillageId = villageId;
  hero.status = "home";
  hero.where = null;
  return ok({});
}
