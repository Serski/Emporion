import type { Content } from "../content/load.js";
import type { GameState, Ms, Player, Stall } from "../core/types.js";
import { calendarAt } from "../world/calendar.js";
import { altarDurationMs, altarLit, craftCheck, craftDurationMs, craftSlots } from "./crafting.js";
import { busyPeople, goodsOf, upkeepPerSeason } from "./house.js";
import { assassinationOdds, plotCheck, poisonOdds } from "./intrigue.js";
import { goodName, isResource, openStalls, priceOf } from "./market.js";
import { dayView, effectiveStats, type DayView } from "./profile.js";
import { shipsAtSea } from "./sea.js";

// ---------------------------------------------------------------------------
// Read models for the MASSALIA pack: the house (purse, stores, people, crafts,
// altar, fleet, sheet and day) and the market (prices and stalls).
// ---------------------------------------------------------------------------

export interface StatView {
  id: string;
  name: string;
  icon: string;
  about: string;
  base: number;
  value: number; // with traits
  traitDelta: number;
}

export interface HouseView {
  purse: number;
  currency: { name: string; short: string };
  season: { index: number; name: string; nextAt: Ms };
  goods: { id: string; name: string; icon: string | null; group: string; have: number }[];
  people: { id: string; name: string; plural: string; icon: string | null; portrait: string | null; about: string; have: number; busy: number; hire: number; sellBack: number; upkeep: number; food: number; max: number | null; dismiss: string }[];
  upkeepPerSeason: number;
  stats: StatView[];
  composure: number;
  withdrawn: boolean;
  traits: { id: string; name: string; kind: string; description: string; stats: Record<string, number> }[];
  ladders: { id: string; name: string; stat: string; xp: number; next: number | null; tier: string | null }[];
  posture: "guard" | "hunt";
  day: DayView | null;
  crafts: { id: string; recipeId: string; name: string; villageName: string | null; startAt: Ms; readyAt: Ms }[];
  recipes: { id: string; name: string; building: string | null; level: number; hours: number; durationMs: Ms; people: Record<string, number>; resources: Record<string, number>; goods: Record<string, number>; output: Record<string, number> }[];
  householdSlots: number;
  altar: { good: string; boost: number; until: Ms } | null;
  altarDurationMs: Ms;
  offerings: { good: string; name: string; boost: number; have: number }[];
  ships: { id: string; name: string; role: string; range: number; troopSpace: number; naval: number; inPort: number; atSea: number }[];
}

export function houseView(state: GameState, content: Content, p: Player, at: Ms): HouseView {
  const cal = calendarAt(state, content, at);
  const prof = p.profile;
  const cfg = content.massalia;
  const busy = busyPeople(p);
  const eff = prof ? effectiveStats(content, prof) : {};
  const stats: StatView[] = cfg.profile.stats.map((s) => {
    const base = prof?.stats[s.id] ?? 0;
    const value = eff[s.id] ?? 0;
    return { id: s.id, name: s.name, icon: s.icon, about: s.about, base, value, traitDelta: value - base };
  });
  const ladders = cfg.profile.ladders.map((l) => {
    const xp = prof?.ladders[l.id] ?? 0;
    let tier: string | null = null;
    let next: number | null = null;
    for (const t of l.tiers) {
      if (xp >= t.xp) tier = content.profileTraits[t.trait]?.name ?? t.trait;
      else if (next === null) next = t.xp;
    }
    return { id: l.id, name: l.name, stat: l.stat, xp, next, tier };
  });
  const atSea = shipsAtSea(p);
  return {
    purse: Math.floor(p.purse),
    currency: { name: cfg.market.currency.name, short: cfg.market.currency.short },
    season: { index: cal.seasonIndex, name: cal.season, nextAt: cal.nextSeasonAt },
    goods: cfg.market.goods.map((g) => ({ id: g.id, name: g.name, icon: g.icon ?? null, group: g.group, have: goodsOf(p, g.id) })),
    people: cfg.people.people.map((d) => ({
      id: d.id,
      name: d.name,
      plural: d.plural,
      icon: d.icon ?? null,
      portrait: d.portrait ?? null,
      about: d.about,
      have: p.people[d.id] ?? 0,
      busy: busy[d.id] ?? 0,
      hire: d.hire,
      sellBack: d.sellBack,
      upkeep: d.upkeep,
      food: d.food * state.settings.speed,
      max: d.max ?? null,
      dismiss: d.dismiss,
    })),
    upkeepPerSeason: upkeepPerSeason(content, p),
    stats,
    composure: prof?.composure ?? 0,
    withdrawn: prof?.withdrawnSeason === cal.seasonIndex,
    traits: (prof?.traits ?? []).map((t) => {
      const d = content.profileTraits[t];
      return { id: t, name: d?.name ?? t, kind: d?.kind ?? "neutral", description: d?.description ?? "", stats: d?.stats ?? {} };
    }),
    ladders,
    posture: prof?.posture ?? "guard",
    day: dayView(state, content, p, at),
    crafts: p.crafts.map((j) => ({ id: j.id, recipeId: j.recipeId, name: content.recipes[j.recipeId]?.name ?? j.recipeId, villageName: j.villageId ? (state.villages[j.villageId]?.name ?? null) : null, startAt: j.startAt, readyAt: j.readyAt })),
    recipes: cfg.crafting.recipes.map((r) => ({ id: r.id, name: r.name, building: r.building ?? null, level: r.level ?? 0, hours: r.hours, durationMs: craftDurationMs(state, content, r.id), people: r.people, resources: r.resources, goods: r.goods, output: r.output })),
    householdSlots: craftSlots(content, p, state, "household"),
    altar: (() => {
      const a = altarLit(p, at);
      return a ? { good: a.good, boost: a.boost, until: a.until } : null;
    })(),
    altarDurationMs: altarDurationMs(state, content, p),
    offerings: cfg.crafting.altar.offerings.map((o) => ({ good: o.good, name: content.goods[o.good]?.name ?? o.good, boost: o.boost, have: goodsOf(p, o.good) })),
    ships: Object.values(content.ships).map((s) => ({ id: s.id, name: s.name, role: s.role, range: s.range, troopSpace: s.troopSpace, naval: s.naval, inPort: goodsOf(p, s.id), atSea: atSea[s.id] ?? 0 })),
  };
}

// Which of the house's crafts can start in a town now, and why not.
export function craftOptions(state: GameState, content: Content, p: Player, villageId: string | null, building: string | null) {
  return content.massalia.crafting.recipes
    .filter((r) => (building ? r.building === building : !r.building))
    .map((r) => ({ id: r.id, name: r.name, check: craftCheck(state, content, p, r.id, r.building ? villageId : null), slots: craftSlots(content, p, state, r.building ? "harbor" : "household", villageId) }));
}

export interface MarketRow {
  id: string;
  name: string;
  icon: string | null;
  group: "resources" | "goods" | "materials" | "naval";
  lot: number;
  buy: number;
  sell: number;
  have: number; // units held (lots for a town resource in the trading town)
}

export interface StallView {
  id: string;
  good: string;
  name: string;
  icon: string | null;
  lot: number;
  remaining: number;
  price: number;
  sellerId: string;
  sellerName: string;
  houseName: string | null;
  mine: boolean;
  createdAt: Ms;
}

export interface MarketView {
  season: string;
  rows: MarketRow[];
  stalls: StallView[];
  myStalls: number;
  stallCap: number;
  maxQty: number;
  maxPrice: number;
  taxRate: number;
}

export function marketView(state: GameState, content: Content, p: Player, villageId: string, at: Ms): MarketView {
  const v = state.villages[villageId];
  const cfg = content.massalia.market;
  const rows: MarketRow[] = [];
  for (const r of content.resourceIds) {
    const price = priceOf(state, content, r, at, p)!;
    rows.push({ id: r, name: goodName(content, r), icon: content.resources.find((x) => x.id === r)?.icon ?? null, group: "resources", lot: price.lot, buy: price.buy, sell: price.sell, have: v ? Math.floor((v.resources[r] ?? 0) / price.lot) : 0 });
  }
  for (const g of cfg.goods) {
    const price = priceOf(state, content, g.id, at, p)!;
    rows.push({ id: g.id, name: g.name, icon: g.icon ?? null, group: g.group, lot: 1, buy: price.buy, sell: price.sell, have: goodsOf(p, g.id) });
  }
  const stalls: StallView[] = Object.values(state.market.stalls)
    .map((s: Stall) => {
      const seller = state.players[s.sellerId];
      return {
        id: s.id,
        good: s.good,
        name: goodName(content, s.good),
        icon: content.goods[s.good]?.icon ?? content.resources.find((x) => x.id === s.good)?.icon ?? null,
        lot: isResource(content, s.good) ? cfg.resourceLot : 1,
        remaining: s.remaining,
        price: s.price,
        sellerId: s.sellerId,
        sellerName: seller?.name ?? "?",
        houseName: seller?.house?.name ?? null,
        mine: s.sellerId === p.id,
        createdAt: s.createdAt,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.price - b.price || a.createdAt - b.createdAt);
  return {
    season: calendarAt(state, content, at).season,
    rows,
    stalls,
    myStalls: openStalls(state, p.id).length,
    stallCap: cfg.stalls.max,
    maxQty: cfg.stalls.maxQty,
    maxPrice: cfg.stalls.maxPrice,
    taxRate: cfg.stalls.taxRate,
  };
}

// What a plot against another house would look like right now.
export function plotView(state: GameState, content: Content, actor: Player, target: Player, at: Ms) {
  const check = plotCheck(state, content, actor, target, at);
  return {
    check,
    poison: poisonOdds(content, actor, target),
    assassination: assassinationOdds(content, actor, target),
    poisonCost: content.massalia.intrigue.poison.good,
    assassinCost: content.massalia.intrigue.assassination.cost,
    havePoison: goodsOf(actor, content.massalia.intrigue.poison.good),
  };
}
