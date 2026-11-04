import type { Content } from "./content/load.js";
import { fail, ok, type Result } from "./core/result.js";
import type { GameState, HeroPoints, Ms, Resources, Troops } from "./core/types.js";
import { cancelBuild, construct, ownVillage, upgradeBuilding, upgradeField } from "./economy/construction.js";
import { holdFestival, research, train, upgradeUnit } from "./economy/training.js";
import { sendResources, sendTroops, withdraw, type SendOrder } from "./military/movements.js";
import { assignHeroPoints, moveHeroHome, reviveHero, setHeroProduction } from "./social/hero.js";
import { collectTribute, foundKingdom, joinKingdom, leaveKingdom } from "./social/kingdoms.js";
import { adopt, ensureFamilies, marry, nameChild } from "./social/family.js";
import { markRead } from "./social/reports.js";
import { craft, sacrifice } from "./massalia/crafting.js";
import { dismiss, ensureMassalia, hire } from "./massalia/house.js";
import { assassinate, cure, poison, setPosture } from "./massalia/intrigue.js";
import { buyStall, cancelStall, listStall, vendorTrade } from "./massalia/market.js";
import { doRoutine } from "./massalia/profile.js";
import { ensureStates } from "./massalia/states.js";
import { touch } from "./village/timeline.js";
import { advance, advanceAll, settle } from "./world/settle.js";
import { addPlayer, createWorld, type AddPlayerOptions, type WorldOptions } from "./world/world.js";

// ---------------------------------------------------------------------------
// The facade a host (the local client, or a server request handler) drives.
// Every command settles the world to `now` first, then validates and applies
// the intent. A server would run each call inside one transaction (or one
// lock) per world; the local client runs them on the main thread.
// ---------------------------------------------------------------------------

export class Game {
  constructor(
    readonly content: Content,
    public state: GameState,
  ) {}

  static create(content: Content, opts: WorldOptions): Game {
    return new Game(content, createWorld(content, opts));
  }

  private at(now: Ms) {
    settle(this.state, this.content, now);
  }

  advance(now: Ms, playerId?: string) {
    advance(this.state, this.content, now, playerId);
  }

  advanceAll(now: Ms) {
    advanceAll(this.state, this.content, now);
  }

  join(opts: AddPlayerOptions) {
    this.at(opts.at);
    return addPlayer(this.state, this.content, opts);
  }

  upgradeField(playerId: string, villageId: string, index: number, now: Ms) {
    this.at(now);
    return upgradeField(this.state, this.content, playerId, villageId, index, now);
  }

  construct(playerId: string, villageId: string, slot: number, buildingId: string, now: Ms) {
    this.at(now);
    return construct(this.state, this.content, playerId, villageId, slot, buildingId, now);
  }

  upgradeBuilding(playerId: string, villageId: string, slot: number, now: Ms) {
    this.at(now);
    return upgradeBuilding(this.state, this.content, playerId, villageId, slot, now);
  }

  cancelBuild(playerId: string, villageId: string, jobId: string, now: Ms) {
    this.at(now);
    return cancelBuild(this.state, this.content, playerId, villageId, jobId, now);
  }

  train(playerId: string, villageId: string, unitId: string, count: number, now: Ms) {
    this.at(now);
    return train(this.state, this.content, playerId, villageId, unitId, count, now);
  }

  research(playerId: string, villageId: string, unitId: string, now: Ms) {
    this.at(now);
    return research(this.state, this.content, playerId, villageId, unitId, now);
  }

  upgradeUnit(playerId: string, villageId: string, unitId: string, now: Ms) {
    this.at(now);
    return upgradeUnit(this.state, this.content, playerId, villageId, unitId, now);
  }

  holdFestival(playerId: string, villageId: string, festivalId: string, now: Ms) {
    this.at(now);
    return holdFestival(this.state, this.content, playerId, villageId, festivalId, now);
  }

  send(order: SendOrder, now: Ms) {
    this.at(now);
    return sendTroops(this.state, this.content, order, now);
  }

  withdraw(playerId: string, where: { villageId: string } | { oasisTile: number }, homeVillageId: string, now: Ms, troops?: Troops) {
    this.at(now);
    return withdraw(this.state, this.content, playerId, where, homeVillageId, now, troops);
  }

  sendResources(playerId: string, fromVillageId: string, toVillageId: string, resources: Resources, now: Ms) {
    this.at(now);
    return sendResources(this.state, this.content, playerId, fromVillageId, toVillageId, resources, now);
  }

  renameVillage(playerId: string, villageId: string, name: string, now: Ms): Result {
    this.at(now);
    const own = ownVillage(this.state, playerId, villageId);
    if (!own.ok) return own;
    const clean = name.replace(/\s+/g, " ").trim().slice(0, 32);
    if (!clean) return fail("invalid", "A town needs a name.");
    touch(this.state, this.content, own.v, now);
    own.v.name = clean;
    return ok({});
  }

  assignHeroPoints(playerId: string, points: Partial<HeroPoints>, now: Ms) {
    this.at(now);
    return assignHeroPoints(this.state, this.content, playerId, points, now);
  }

  setHeroProduction(playerId: string, resource: string, now: Ms) {
    this.at(now);
    return setHeroProduction(this.state, this.content, playerId, resource, now);
  }

  reviveHero(playerId: string, now: Ms) {
    this.at(now);
    return reviveHero(this.state, this.content, playerId, now);
  }

  moveHeroHome(playerId: string, villageId: string, now: Ms) {
    this.at(now);
    return moveHeroHome(this.state, this.content, playerId, villageId, now);
  }

  foundKingdom(playerId: string, name: string, now: Ms) {
    this.at(now);
    return foundKingdom(this.state, this.content, playerId, name, now);
  }

  joinKingdom(playerId: string, kingdomId: string, now: Ms) {
    this.at(now);
    return joinKingdom(this.state, this.content, playerId, kingdomId, now);
  }

  leaveKingdom(playerId: string, now: Ms) {
    this.at(now);
    return leaveKingdom(this.state, this.content, playerId, now);
  }

  collectTribute(playerId: string, now: Ms) {
    this.at(now);
    return collectTribute(this.state, this.content, playerId, now);
  }

  marry(playerId: string, candidateId: string, now: Ms) {
    this.at(now);
    return marry(this.state, this.content, playerId, candidateId, now);
  }

  nameChild(playerId: string, childId: string, name: string, now: Ms) {
    this.at(now);
    return nameChild(this.state, this.content, playerId, childId, name);
  }

  adopt(playerId: string, candidateId: string, now: Ms) {
    this.at(now);
    return adopt(this.state, this.content, playerId, candidateId, now);
  }

  markRead(playerId: string, reportId: string) {
    markRead(this.state, playerId, reportId);
  }

  // --- MASSALIA's markets, people, day, crafts, altar and plots ---

  vendorTrade(playerId: string, villageId: string, action: "buy" | "sell", good: string, qty: number, now: Ms) {
    this.at(now);
    return vendorTrade(this.state, this.content, playerId, villageId, action, good, qty, now);
  }

  listStall(playerId: string, villageId: string, good: string, qty: number, price: number, now: Ms) {
    this.at(now);
    return listStall(this.state, this.content, playerId, villageId, good, qty, price, now);
  }

  buyStall(playerId: string, villageId: string, stallId: string, qty: number, now: Ms) {
    this.at(now);
    return buyStall(this.state, this.content, playerId, villageId, stallId, qty, now);
  }

  cancelStall(playerId: string, stallId: string, now: Ms) {
    this.at(now);
    return cancelStall(this.state, this.content, playerId, stallId, now);
  }

  hire(playerId: string, villageId: string, personId: string, count: number, now: Ms) {
    this.at(now);
    return hire(this.state, this.content, playerId, villageId, personId, count, now);
  }

  dismiss(playerId: string, personId: string, count: number, now: Ms) {
    this.at(now);
    return dismiss(this.state, this.content, playerId, personId, count, now);
  }

  doRoutine(playerId: string, routineId: string, now: Ms) {
    this.at(now);
    return doRoutine(this.state, this.content, playerId, routineId, now);
  }

  craft(playerId: string, recipeId: string, villageId: string | null, now: Ms) {
    this.at(now);
    return craft(this.state, this.content, playerId, recipeId, villageId, now);
  }

  sacrifice(playerId: string, villageId: string, good: string, now: Ms) {
    this.at(now);
    return sacrifice(this.state, this.content, playerId, villageId, good, now);
  }

  poison(playerId: string, targetId: string, now: Ms) {
    this.at(now);
    return poison(this.state, this.content, playerId, targetId, now);
  }

  assassinate(playerId: string, targetId: string, now: Ms) {
    this.at(now);
    return assassinate(this.state, this.content, playerId, targetId, now);
  }

  cure(playerId: string, now: Ms) {
    this.at(now);
    return cure(this.state, this.content, playerId, now);
  }

  setPosture(playerId: string, posture: "guard" | "hunt", now: Ms) {
    this.at(now);
    return setPosture(this.state, this.content, playerId, posture, now);
  }

  // Plain JSON for storage; Game.restore(content, JSON.parse(json)) reverses it.
  serialize(): string {
    return JSON.stringify(this.state);
  }

  static restore(content: Content, state: GameState): Game {
    if (state.schema !== 1) throw new Error(`unsupported save schema ${String((state as { schema?: unknown }).schema)}`);
    // Saves from before the family pack get their houses now, and saves from
    // before the MASSALIA pack their purses, sheets and states.
    ensureFamilies(state, content, state.time);
    ensureMassalia(state, content, state.time);
    ensureStates(state, content, state.time);
    return new Game(content, state);
  }
}
