import type { Content } from "../content/load.js";
import { newId } from "../core/ids.js";
import { fail, ok, type Result } from "../core/result.js";
import type { GameState, Ms, Player, Stall, Village } from "../core/types.js";
import { addReport } from "../social/reports.js";
import { buildingLevel, capacity } from "../village/stats.js";
import { touch } from "../village/timeline.js";
import { calendarAt } from "../world/calendar.js";
import { addGoods, goodsOf } from "./house.js";
import { statOf } from "./profile.js";

// ---------------------------------------------------------------------------
// MASSALIA's markets. The NPC agora buys and sells every good at a seasonal
// band: it sells dear and buys cheap, without limit, and keeps no stock
// (packages/shared/src/buildings.ts vendorUnitPrice). The players' market is
// sell-only stalls: the goods are held in escrow, a buyer may take part of a
// stall, and the city keeps a tenth of every sale (market.ts).
//
// Goods are the house's. A town's four resources trade too, in lots of
// `resourceLot`, from and into the town where the trade is made; that town
// needs an Agora.
// ---------------------------------------------------------------------------

export interface Band {
  sell: number;
  buy: number;
  category: "agricultural" | "yearround";
}

export function isResource(content: Content, id: string): boolean {
  return content.resourceIds.includes(id);
}

export function tradeable(content: Content, id: string): boolean {
  return !!content.goods[id] || isResource(content, id);
}

export function bandOf(content: Content, id: string): Band | null {
  const g = content.goods[id];
  if (g) return { sell: g.sell, buy: g.buy, category: g.category };
  const r = content.massalia.market.resources[id];
  return r ? { sell: r.sell, buy: r.buy, category: r.category } : null;
}

export function goodName(content: Content, id: string): string {
  return content.goods[id]?.name ?? content.resources.find((r) => r.id === id)?.name ?? id;
}

export interface Price {
  good: string;
  buy: number; // what the player pays the agora, per unit (per lot)
  sell: number; // what the agora pays the player
  lot: number; // 1 for a good; resourceLot for a town resource
}

// Prices on the season of `at`. Prestige makes the agora pay a little more.
export function priceOf(state: GameState, content: Content, id: string, at: Ms, seller?: Player): Price | null {
  const band = bandOf(content, id);
  if (!band) return null;
  const cfg = content.massalia.market;
  const seasons = content.world.calendar.seasons.length;
  const idx = calendarAt(state, content, at).seasonIndex % seasons;
  const coeff = cfg.seasonal[band.category]?.[idx] ?? 1;
  const bonus = 1 + statOf(content, seller, "prestige") * cfg.prestigePriceBonus;
  return {
    good: id,
    buy: Math.max(1, Math.round(band.sell * coeff)),
    sell: Math.max(1, Math.round(band.buy * coeff * bonus)),
    lot: isResource(content, id) ? cfg.resourceLot : 1,
  };
}

function marketTown(state: GameState, content: Content, p: Player, villageId: string, at: Ms): Result<{ v: Village }> {
  const v = state.villages[villageId];
  if (!v || v.ownerId !== p.id) return fail("not_found", "That is not one of your towns.");
  if (buildingLevel(v, content.massalia.market.building) <= 0) return fail("requirements", `${v.name} has no Agora. Build one to trade there.`);
  touch(state, content, v, at);
  return ok({ v });
}

function room(content: Content, v: Village, r: string): number {
  return Math.max(0, (capacity(content, v)[r] ?? 0) - (v.resources[r] ?? 0));
}

// --- the NPC agora ------------------------------------------------------------

export interface VendorTrade {
  action: "buy" | "sell";
  good: string;
  qty: number; // units, or lots for a resource
  unitPrice: number;
  total: number;
}

export function vendorTrade(state: GameState, content: Content, playerId: string, villageId: string, action: "buy" | "sell", good: string, qty: number, at: Ms): Result<VendorTrade> {
  const p = state.players[playerId];
  if (!p) return fail("not_found", "No such player.");
  if (!tradeable(content, good)) return fail("not_found", "The agora does not trade that good.");
  if (!Number.isInteger(qty) || qty < 1) return fail("invalid", "Trade a whole, positive quantity.");
  const town = marketTown(state, content, p, villageId, at);
  if (!town.ok) return town;
  const v = town.v;
  const price = priceOf(state, content, good, at, p)!;
  const resource = isResource(content, good);
  if (action === "buy") {
    const total = price.buy * qty;
    if (p.purse < total) return fail("insufficient", `You need ${total} drachmae for that.`);
    if (resource && room(content, v, good) < qty * price.lot) return fail("storage", `The stores of ${v.name} have room for ${Math.floor(room(content, v, good))} more ${goodName(content, good).toLowerCase()}.`);
    p.purse -= total;
    if (resource) v.resources[good] = (v.resources[good] ?? 0) + qty * price.lot;
    else addGoods(p, good, qty);
    return ok({ action, good, qty, unitPrice: price.buy, total });
  }
  const have = resource ? Math.floor((v.resources[good] ?? 0) / price.lot) : goodsOf(p, good);
  if (have < qty) return fail("insufficient", resource ? `${v.name} holds only ${have} lots of ${price.lot} ${goodName(content, good).toLowerCase()}.` : `You hold only ${have} ${goodName(content, good).toLowerCase()}.`);
  const total = price.sell * qty;
  if (resource) v.resources[good] = (v.resources[good] ?? 0) - qty * price.lot;
  else addGoods(p, good, -qty);
  p.purse += total;
  return ok({ action, good, qty, unitPrice: price.sell, total });
}

// --- the players' market ------------------------------------------------------------

export function openStalls(state: GameState, playerId: string): Stall[] {
  return Object.values(state.market.stalls).filter((s) => s.sellerId === playerId);
}

export function listStall(state: GameState, content: Content, playerId: string, villageId: string, good: string, qty: number, price: number, at: Ms): Result<{ stall: Stall }> {
  const p = state.players[playerId];
  if (!p) return fail("not_found", "No such player.");
  const cfg = content.massalia.market.stalls;
  if (!tradeable(content, good)) return fail("not_found", "The market does not trade that good.");
  if (!Number.isInteger(qty) || qty < 1 || qty > cfg.maxQty) return fail("invalid", `List a whole quantity from 1 to ${cfg.maxQty}.`);
  if (!Number.isInteger(price) || price < 1 || price > cfg.maxPrice) return fail("invalid", `Ask a whole price from 1 to ${cfg.maxPrice} drachmae.`);
  if (openStalls(state, playerId).length >= cfg.max) return fail("limit", `${cfg.max} stalls is the most one house may keep.`);
  const town = marketTown(state, content, p, villageId, at);
  if (!town.ok) return town;
  const v = town.v;
  const resource = isResource(content, good);
  const lot = content.massalia.market.resourceLot;
  if (resource) {
    const lots = Math.floor((v.resources[good] ?? 0) / lot);
    if (lots < qty) return fail("insufficient", `${v.name} holds only ${lots} lots of ${lot} ${goodName(content, good).toLowerCase()}.`);
    v.resources[good] = (v.resources[good] ?? 0) - qty * lot;
  } else {
    if (goodsOf(p, good) < qty) return fail("insufficient", `You hold only ${goodsOf(p, good)} ${goodName(content, good).toLowerCase()}.`);
    addGoods(p, good, -qty);
  }
  const stall: Stall = { id: newId(state, "s"), sellerId: p.id, good, remaining: qty, price, createdAt: at, villageId: resource ? v.id : null };
  state.market.stalls[stall.id] = stall;
  return ok({ stall });
}

export interface StallSale {
  qty: number;
  total: number;
  tax: number;
}

export function buyStall(state: GameState, content: Content, playerId: string, villageId: string, stallId: string, qty: number, at: Ms): Result<StallSale> {
  const p = state.players[playerId];
  if (!p) return fail("not_found", "No such player.");
  const stall = state.market.stalls[stallId];
  if (!stall) return fail("not_found", "That stall is gone.");
  if (stall.sellerId === p.id) return fail("invalid", "That is your own stall. Cancel it instead.");
  if (!Number.isInteger(qty) || qty < 1) return fail("invalid", "Buy a whole, positive quantity.");
  if (stall.remaining < qty) return fail("insufficient", `Only ${stall.remaining} remain at that stall.`);
  const town = marketTown(state, content, p, villageId, at);
  if (!town.ok) return town;
  const v = town.v;
  const total = stall.price * qty;
  if (p.purse < total) return fail("insufficient", `You need ${total} drachmae for that.`);
  const resource = isResource(content, stall.good);
  const lot = content.massalia.market.resourceLot;
  if (resource && room(content, v, stall.good) < qty * lot) return fail("storage", `The stores of ${v.name} have room for ${Math.floor(room(content, v, stall.good))} more ${goodName(content, stall.good).toLowerCase()}.`);
  const tax = Math.floor(total * content.massalia.market.stalls.taxRate);
  const seller = state.players[stall.sellerId];
  p.purse -= total;
  if (seller) seller.purse += total - tax;
  state.market.taxCollected += tax;
  if (resource) v.resources[stall.good] = (v.resources[stall.good] ?? 0) + qty * lot;
  else addGoods(p, stall.good, qty);
  stall.remaining -= qty;
  if (stall.remaining <= 0) delete state.market.stalls[stall.id];
  const unit = resource ? `lots of ${lot} ${goodName(content, stall.good).toLowerCase()}` : goodName(content, stall.good).toLowerCase();
  if (seller) {
    addReport(state, at, "market", `${p.name} bought ${qty} ${unit}`, [seller.id], {
      type: "simple",
      lines: [`${p.name} bought ${qty} ${unit} at your stall for ${total} drachmae.`, `The city kept ${tax} as its tenth; ${total - tax} came to your purse.`],
    });
  }
  return ok({ qty, total, tax });
}

export function cancelStall(state: GameState, content: Content, playerId: string, stallId: string, at: Ms): Result<{ returned: number }> {
  const p = state.players[playerId];
  const stall = state.market.stalls[stallId];
  if (!p || !stall || stall.sellerId !== p.id) return fail("not_found", "That stall is gone.");
  delete state.market.stalls[stall.id];
  if (isResource(content, stall.good)) {
    // The lots go back where they came from, or to the capital if that town
    // was lost; stores already full spill over, as any delivery does.
    const home = (stall.villageId && state.villages[stall.villageId]?.ownerId === p.id ? state.villages[stall.villageId] : undefined) ?? (p.capitalId ? state.villages[p.capitalId] : undefined);
    if (home) {
      touch(state, content, home, at);
      home.resources[stall.good] = Math.min(capacity(content, home)[stall.good] ?? 0, (home.resources[stall.good] ?? 0) + stall.remaining * content.massalia.market.resourceLot);
    }
  } else addGoods(p, stall.good, stall.remaining);
  return ok({ returned: stall.remaining });
}
