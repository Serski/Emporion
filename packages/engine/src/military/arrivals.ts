import type { Content } from "../content/load.js";
import { addTroops, cleanTroops, totalResources, troopCount } from "../core/resources.js";
import { pick, randomInt } from "../core/rng.js";
import type {
  BattleReportData,
  GameState,
  Movement,
  Ms,
  OasisState,
  Player,
  ReportSide,
  Resources,
  Stationed,
  Troops,
  Village,
} from "../core/types.js";
import { newId, nextSeq } from "../core/ids.js";
import { addReport } from "../social/reports.js";
import { grantXp, heroAlive, heroInBattle, woundHero } from "../social/hero.js";
import { touch, touchId } from "../village/timeline.js";
import {
  blocksConquest,
  capacity,
  cultureForVillages,
  expansionSlots,
  factionOf,
  hidden,
  oasisSlots,
  playerCulture,
  playerPopulation,
  troopUpkeep,
  wallLevel,
} from "../village/stats.js";
import { tileInfo, tileXY } from "../world/map.js";
import { oasisAt } from "../world/oases.js";
import { createVillage, isFreeValley } from "../world/world.js";
import { familyMods } from "../social/family.js";
import { altarBoost } from "../massalia/crafting.js";
import { scoutStatFactor } from "../massalia/profile.js";
import { harbourFleet, navalStrength } from "../massalia/sea.js";
import { inForeignTerritory, villageClaims } from "../world/territory.js";
import {
  carryCapacity,
  demolish,
  lossesAt,
  resolveBattle,
  resolveScouting,
  scoutPower,
  siegeDamage,
  splitLoot,
  stacksOf,
  type BattleResolver,
} from "./combat.js";
import { marchMs, sendHome, targetAt, villageTile } from "./movements.js";

// The battle resolver in use. Replace with setBattleResolver to try other rules.
let battle: BattleResolver = resolveBattle;
export function setBattleResolver(r: BattleResolver): void {
  battle = r;
}

export function arrive(state: GameState, content: Content, m: Movement): void {
  const at = m.arriveAt;
  // The home town has fed these troops right up to this moment.
  touchId(state, content, m.homeVillageId, at);
  delete state.movements[m.id];
  switch (m.kind) {
    case "attack":
    case "raid":
      return resolveAttack(state, content, m, at);
    case "scout":
      return resolveScout(state, content, m, at);
    case "reinforce":
      return resolveReinforce(state, content, m, at);
    case "settle":
      return resolveSettle(state, content, m, at);
    case "return":
      return resolveReturn(state, content, m, at);
    case "trade":
      return resolveTrade(state, content, m, at);
    case "tradeReturn":
      return;
  }
}

// --- helpers -------------------------------------------------------------------

interface DefenderGroup {
  ownerId: string | null;
  factionId: string;
  villageId: string | null;
  villageName: string;
  troops: Troops;
  armory: Record<string, number>;
  heroOwner: Player | null;
  write: (survivors: Troops) => void;
  dropHero: () => void;
}

function homeName(state: GameState, villageId: string | null): string {
  return (villageId && state.villages[villageId]?.name) || "—";
}

function placeLabel(state: GameState, content: Content, tile: number): string {
  const vid = state.occupancy[tile];
  if (vid && state.villages[vid]) return state.villages[vid]!.name;
  const info = tileInfo(content, state.settings.seed, tile);
  if (info.oasis) return info.oasis.name;
  return `(${info.x}|${info.y})`;
}

function stationedGroup(state: GameState, s: Stationed, placeKey: string, list: () => Stationed[], setList: (l: Stationed[]) => void): DefenderGroup {
  const owner = state.players[s.ownerId] ?? null;
  const hero = owner?.hero;
  const heroHere = s.hero && heroAlive(hero) && hero.status === "stationed" && hero.where === placeKey;
  return {
    ownerId: s.ownerId,
    factionId: s.factionId,
    villageId: s.homeVillageId,
    villageName: homeName(state, s.homeVillageId),
    troops: { ...s.troops },
    armory: s.armory,
    heroOwner: heroHere ? owner : null,
    write: (survivors) => {
      s.troops = cleanTroops(survivors);
      if (troopCount(s.troops) === 0 && !s.hero) setList(list().filter((x) => x !== s));
    },
    dropHero: () => {
      s.hero = false;
      if (troopCount(s.troops) === 0) setList(list().filter((x) => x !== s));
    },
  };
}

function villageDefenders(state: GameState, content: Content, v: Village): DefenderGroup[] {
  const owner = state.players[v.ownerId] ?? null;
  const hero = owner?.hero;
  const heroHome = heroAlive(hero) && hero.status === "home" && hero.homeVillageId === v.id;
  const groups: DefenderGroup[] = [
    {
      ownerId: v.ownerId,
      factionId: owner?.factionId ?? "",
      villageId: v.id,
      villageName: v.name,
      troops: { ...v.troops },
      armory: v.armory.levels,
      heroOwner: heroHome ? owner : null,
      write: (survivors) => (v.troops = cleanTroops(survivors)),
      dropHero: () => undefined,
    },
  ];
  for (const s of v.stationed) {
    groups.push(stationedGroup(state, s, `v:${v.id}`, () => v.stationed, (l) => (v.stationed = l)));
  }
  return groups;
}

function oasisDefenders(state: GameState, content: Content, o: OasisState): DefenderGroup[] {
  if (!o.ownerVillageId) {
    const wild = content.unitFaction[Object.keys(o.animals)[0] ?? ""] ?? "wildlife";
    return [
      {
        ownerId: null,
        factionId: wild,
        villageId: null,
        villageName: content.oasisTypes[o.typeId]?.name ?? "Oasis",
        troops: { ...o.animals },
        armory: {},
        heroOwner: null,
        write: (survivors) => (o.animals = cleanTroops(survivors)),
        dropHero: () => undefined,
      },
    ];
  }
  return o.stationed.map((s) => stationedGroup(state, s, `o:${o.tile}`, () => o.stationed, (l) => (o.stationed = l)));
}

function side(state: GameState, group: { ownerId: string | null; villageId: string | null; villageName: string; factionId: string }, troops: Troops, losses: Troops): ReportSide {
  const p = group.ownerId ? state.players[group.ownerId] : undefined;
  return {
    playerId: group.ownerId,
    playerName: p?.name ?? "Nature",
    villageId: group.villageId,
    villageName: group.villageName,
    factionId: group.factionId,
    troops,
    losses,
    hero: null,
  };
}

function morale(state: GameState, content: Content, attacker: Player, defenderId: string | null): number {
  const defender = defenderId ? state.players[defenderId] : undefined;
  if (!defender || attacker.kind === "npc" || defender.kind === "npc") return 1;
  const a = playerPopulation(state, content, attacker);
  const d = playerPopulation(state, content, defender);
  if (a <= d || a <= 0) return 1;
  const m = content.world.combat.morale;
  return Math.max(m.min, (d / a) ** m.exponent);
}

// --- attack and raid -------------------------------------------------------------

function resolveAttack(state: GameState, content: Content, m: Movement, at: Ms): void {
  const mode = m.kind === "raid" ? "raid" : "attack";
  const attacker = state.players[m.ownerId]!;
  const target = targetAt(state, content, m.toTile);
  const notes: string[] = [];
  const { x, y } = tileXY(content, m.toTile);
  const label = placeLabel(state, content, m.toTile);

  let tv: Village | null = null;
  let oasis: OasisState | null = null;
  let groups: DefenderGroup[];
  if (target.kind === "village") {
    tv = target.village!;
    touch(state, content, tv, at);
    groups = villageDefenders(state, content, tv);
  } else if (target.kind === "oasis") {
    oasis = oasisAt(state, content, m.toTile, at)!;
    touchId(state, content, oasis.ownerVillageId, at);
    groups = oasisDefenders(state, content, oasis);
  } else {
    sendHome(state, content, { ...homeArgs(m), troops: m.troops, hero: m.hero, mission: m.kind }, at);
    addReport(state, at, "battle", `Nobody at ${label}`, [m.ownerId], { type: "simple", lines: [`Your troops found nobody at (${x}|${y}) and turned back.`], tile: m.toTile });
    return;
  }

  // A landing from the sea is driven off when the town's ships outweigh the
  // escort (MASSALIA: pentekonters count 1, triremes 5).
  if (tv && m.ships && (m.seaZones ?? 0) > 0) {
    const theirs = navalStrength(content, harbourFleet(state, content, tv));
    const ours = navalStrength(content, m.ships);
    if (theirs > ours) {
      sendHome(state, content, { ...homeArgs(m), troops: m.troops, hero: m.hero, mission: m.kind }, at);
      addReport(state, at, "battle", `The landing at ${label} was driven off`, [m.ownerId], {
        type: "simple",
        lines: [`The ships of ${tv.name} (naval strength ${theirs}) outweighed your escort (${ours}), and your troops turned back without a fight.`, "Each Trireme counts five and each Pentekonter one. Bring more warships."],
        tile: m.toTile,
      });
      const defender = state.players[tv.ownerId];
      if (defender && defender.kind !== "npc") {
        addReport(state, at, "battle", `Your ships drove off a landing at ${tv.name}`, [defender.id], { type: "simple", lines: [`A fleet from ${homeName(state, m.homeVillageId)} tried to land at ${tv.name} and was driven off.`], tile: m.toTile });
      }
      return;
    }
  }

  const attackerHero = m.hero && heroAlive(attacker.hero) ? attacker.hero : null;
  const defenderOwnerId = tv ? tv.ownerId : oasis?.ownerVillageId ? (state.villages[oasis.ownerVillageId]?.ownerId ?? null) : null;
  const moraleFactor = morale(state, content, attacker, defenderOwnerId);
  const defenderFaction = tv ? factionOf(state, content, tv) : null;
  const wall = tv ? wallLevel(content, tv) : 0;

  const outcome = battle({
    mode,
    attacker: {
      stacks: stacksOf(content, m.troops, m.armory),
      hero: attackerHero ? heroInBattle(content, attackerHero, familyMods(state, content, attacker, at)) : null,
      morale: moraleFactor,
      boost: 1 + altarBoost(attacker, at),
    },
    defenders: groups.map((g) => ({
      stacks: stacksOf(content, g.troops, g.armory),
      hero: g.heroOwner?.hero ? heroInBattle(content, g.heroOwner.hero, familyMods(state, content, g.heroOwner, at)) : null,
      boost: 1 + altarBoost(g.ownerId ? state.players[g.ownerId] : undefined, at),
    })),
    wallLevel: wall,
    wallBonusPerLevel: defenderFaction?.wall.bonusPerLevel ?? 0,
    baseDefense: tv ? content.world.village.baseDefense : 0,
    armoryBonusPerLevel: content.world.combat.armoryBonusPerLevel,
    lossExponent: content.world.combat.lossExponent,
    raidLossExponent: content.world.combat.raidLossExponent,
  });

  // Losses.
  const attackerLosses = lossesAt(m.troops, outcome.attackerLossRate);
  const survivors = addTroops({ ...m.troops }, attackerLosses, -1);
  const defenderSides: ReportSide[] = [];
  let defenderLossUpkeep = 0;
  const defenderHeroes: Player[] = [];
  for (const g of groups) {
    const losses = lossesAt(g.troops, outcome.defenderLossRate);
    defenderLossUpkeep += troopUpkeep(content, losses);
    const s = side(state, g, g.troops, losses);
    g.write(addTroops({ ...g.troops }, losses, -1));
    if (g.heroOwner) {
      const w = woundHero(state, content, g.heroOwner, outcome.defenderLossRate, at);
      s.hero = { present: true, healthLost: w.lost, died: w.died, xp: 0 };
      if (w.died) g.dropHero();
      else defenderHeroes.push(g.heroOwner);
    }
    defenderSides.push(s);
  }
  const attackerLossUpkeep = troopUpkeep(content, attackerLosses);
  const attackerSide = side(state, { ownerId: m.ownerId, villageId: m.homeVillageId, villageName: homeName(state, m.homeVillageId), factionId: m.factionId }, m.troops, attackerLosses);
  let heroReturns = false;
  if (m.hero) {
    const w = woundHero(state, content, attacker, outcome.attackerLossRate, at);
    const xp = w.died ? 0 : Math.round(defenderLossUpkeep * content.hero.xpPerUpkeep * (1 + familyMods(state, content, attacker, at).xpBonus));
    if (!w.died && attacker.hero) grantXp(content, attacker.hero, xp);
    attackerSide.hero = { present: true, healthLost: w.lost, died: w.died, xp };
    heroReturns = !w.died;
  }
  if (defenderHeroes.length > 0) {
    const xp = Math.round((attackerLossUpkeep * content.hero.xpPerUpkeep) / defenderHeroes.length);
    for (const p of defenderHeroes) {
      const mine = Math.round(xp * (1 + familyMods(state, content, p, at).xpBonus));
      if (p.hero) grantXp(content, p.hero, mine);
      const s = defenderSides.find((d) => d.playerId === p.id && d.hero);
      if (s?.hero) s.hero.xp = mine;
    }
  }
  if (attacker.kind !== "npc") attacker.offense += defenderLossUpkeep;
  const defOwner = defenderOwnerId ? state.players[defenderOwnerId] : undefined;
  if (defOwner && defOwner.kind !== "npc") defOwner.defense += attackerLossUpkeep;

  const report: BattleReportData = {
    type: "battle",
    mission: mode,
    target: { tile: m.toTile, x, y, label, villageId: tv?.id ?? null, oasis: !!oasis },
    attacker: attackerSide,
    defenders: defenderSides,
    winner: outcome.winner,
    attackPower: Math.round(outcome.attackPower),
    defensePower: Math.round(outcome.defensePower),
    morale: moraleFactor,
    wallLevel: wall,
    wall: null,
    damaged: [],
    loot: {},
    capacity: 0,
    treasures: 0,
    loyalty: null,
    conquered: false,
    annexed: false,
    notes,
  };

  const won = outcome.winner === "attacker";
  const homeVillage = state.villages[m.homeVillageId];

  if (won && mode === "attack" && tv) {
    siege(state, content, tv, survivors, m, report);
    conquest(state, content, tv, attacker, homeVillage ?? null, survivors, report, at);
  }
  if (won && mode === "attack" && oasis && heroReturns) {
    annexOasis(state, content, oasis, attacker, homeVillage ?? null, report, at);
  }

  // Loot whatever the survivors can carry.
  let carry: Resources = {};
  let treasures = 0;
  if (tv && troopCount(survivors) > 0 && !report.conquered) {
    const cap = carryCapacity(content, survivors);
    const hide = tv.kind === "player" ? hidden(state, content, tv) : 0;
    const lootable: Resources = {};
    for (const r of content.resourceIds) lootable[r] = Math.max(0, Math.floor(tv.resources[r] ?? 0) - hide);
    carry = splitLoot(lootable, cap);
    for (const r of content.resourceIds) tv.resources[r] = Math.max(0, (tv.resources[r] ?? 0) - (carry[r] ?? 0));
    report.capacity = cap;
    report.loot = carry;
    if (won && tv.kind !== "player" && tv.treasures > 0) {
      treasures = tv.treasures;
      tv.treasures = 0;
      report.treasures = treasures;
    }
  }

  sendHome(state, content, { ...homeArgs(m), troops: survivors, hero: heroReturns, carry, treasures, mission: m.kind }, at);

  const verb = mode === "raid" ? "raids" : "attacks";
  const recipients = [m.ownerId, defenderOwnerId, ...groups.map((g) => g.ownerId)];
  addReport(state, at, "battle", `${homeName(state, m.homeVillageId)} ${verb} ${label}`, recipients, report);
}

function homeArgs(m: Movement) {
  return { ownerId: m.ownerId, homeVillageId: m.homeVillageId, fromTile: m.toTile, armory: m.armory, factionId: m.factionId };
}

function siege(state: GameState, content: Content, tv: Village, survivors: Troops, m: Movement, report: BattleReportData) {
  const defender = factionOf(state, content, tv);
  const rams = siegeDamage(content, survivors, m.armory, "ram");
  if (rams > 0) {
    const slot = tv.buildings.findIndex((b) => b && content.buildings[b.id]?.effects.wall);
    const b = slot >= 0 ? tv.buildings[slot] : null;
    if (b) {
      const def = content.buildings[b.id]!;
      const to = demolish(content, b.level, rams, defender.wall.durability, def.durability ?? content.world.combat.durability);
      report.wall = { from: b.level, to };
      if (to <= 0) tv.buildings[slot] = null;
      else b.level = to;
    }
  }
  const cats = siegeDamage(content, survivors, m.armory, "catapult");
  if (cats <= 0) return;
  const catapultCount = Object.entries(survivors).reduce((n, [u, c]) => n + (content.units[u]?.role === "catapult" ? c : 0), 0);
  const wanted = m.targets.length >= 2 && catapultCount >= content.world.combat.twoTargetsMinCatapults ? m.targets.slice(0, 2) : [m.targets[0] ?? "random"];
  const share = cats / wanted.length;
  for (const want of wanted) {
    const hit = chooseTarget(state, content, tv, want);
    if (!hit) {
      report.notes.push("The siege engines found nothing left to hit.");
      continue;
    }
    if (hit.kind === "field") {
      const f = tv.fields[hit.index]!;
      const fdef = content.fields[f.resource]!;
      const to = demolish(content, f.level, share, 1);
      report.damaged.push({ target: f.resource, name: fdef.name, from: f.level, to });
      f.level = to;
    } else {
      const b = tv.buildings[hit.index]!;
      const def = content.buildings[b.id]!;
      const to = demolish(content, b.level, share, 1, def.durability ?? content.world.combat.durability);
      report.damaged.push({ target: b.id, name: def.name, from: b.level, to });
      if (to <= 0) tv.buildings[hit.index] = null;
      else b.level = to;
    }
  }
}

function chooseTarget(state: GameState, content: Content, tv: Village, want: string): { kind: "field" | "building"; index: number } | null {
  if (want !== "random") {
    let best = -1;
    tv.buildings.forEach((b, i) => {
      if (b && b.id === want && (best < 0 || b.level > tv.buildings[best]!.level)) best = i;
    });
    if (best >= 0) return { kind: "building", index: best };
    let field = -1;
    tv.fields.forEach((f, i) => {
      if (f.resource === want && f.level > 0 && (field < 0 || f.level > tv.fields[field]!.level)) field = i;
    });
    if (field >= 0) return { kind: "field", index: field };
  }
  const options: { kind: "field" | "building"; index: number }[] = [];
  tv.buildings.forEach((b, i) => {
    if (b && b.level > 0 && !content.buildings[b.id]?.catapultImmune) options.push({ kind: "building", index: i });
  });
  tv.fields.forEach((f, i) => {
    if (f.level > 0) options.push({ kind: "field", index: i });
  });
  return pick(state, options) ?? null;
}

function conquest(state: GameState, content: Content, tv: Village, attacker: Player, home: Village | null, survivors: Troops, report: BattleReportData, at: Ms) {
  const chiefs = Object.entries(survivors).filter(([u, n]) => n > 0 && content.units[u]?.role === "chief");
  if (chiefs.length === 0 || tv.kind !== "player") return;
  const owner = state.players[tv.ownerId];
  const defenderFaction = factionOf(state, content, tv);
  if (!owner || owner.kind === "npc" || !defenderFaction.conquerable) {
    report.notes.push("This place cannot be taken.");
    return;
  }
  if (tv.isCapital) {
    report.notes.push(`${tv.name} is a capital and cannot be taken.`);
    return;
  }
  if (blocksConquest(content, tv)) {
    report.notes.push("Loyalty holds while the Oikist's House or Acropolis stands. Destroy it first.");
    return;
  }
  if (!home || home.ownerId !== attacker.id) return;
  const needCp = cultureForVillages(content, attacker.villageIds.length + 1);
  if (playerCulture(state, attacker) < needCp) {
    report.notes.push(`Not enough culture points to rule another town (need ${needCp}).`);
    return;
  }
  if (expansionSlots(content, home) - home.children.length <= 0) {
    report.notes.push(`${home.name} has no free expansion slot.`);
    return;
  }
  const from = Math.round(tv.loyalty);
  let drop = 0;
  for (const [u, n] of chiefs) {
    const range = content.units[u]!.loyalty!;
    for (let i = 0; i < n; i++) drop += randomInt(state, Math.round(range.min), Math.round(range.max));
  }
  tv.loyalty = Math.max(0, tv.loyalty - drop);
  report.loyalty = { from, to: Math.round(tv.loyalty) };
  if (tv.loyalty > 0) return;
  // One envoy stays to govern; the rest of the army goes home.
  const [firstChief] = chiefs[0]!;
  survivors[firstChief] = (survivors[firstChief] ?? 0) - 1;
  if (survivors[firstChief]! <= 0) delete survivors[firstChief];
  conquer(state, content, tv, attacker, home, at);
  report.conquered = true;
}

export function conquer(state: GameState, content: Content, tv: Village, attacker: Player, home: Village, at: Ms): void {
  const old = state.players[tv.ownerId]!;
  old.cultureBank += tv.culture;
  tv.culture = 0;
  old.villageIds = old.villageIds.filter((id) => id !== tv.id);
  for (const pv of Object.values(state.villages)) if (pv.children.includes(tv.id)) pv.children = pv.children.filter((id) => id !== tv.id);
  const capital = old.capitalId && old.capitalId !== tv.id ? state.villages[old.capitalId] : undefined;
  if (capital) touch(state, content, capital, at);
  // The old owner's troops of this town that are away now belong to the capital.
  for (const mv of Object.values(state.movements)) {
    if (mv.homeVillageId !== tv.id || mv.ownerId !== old.id) continue;
    if (!capital) {
      delete state.movements[mv.id];
      continue;
    }
    mv.homeVillageId = capital.id;
    if (mv.kind === "return" || mv.kind === "tradeReturn") {
      mv.toTile = villageTile(content, capital);
      mv.targetVillageId = capital.id;
      mv.targetOwnerId = old.id;
    }
  }
  const rehome = (list: Stationed[]) => {
    for (const s of list) if (s.homeVillageId === tv.id && s.ownerId === old.id && capital) s.homeVillageId = capital.id;
  };
  for (const hv of Object.values(state.villages)) rehome(hv.stationed);
  for (const o of Object.values(state.oases)) rehome(o.stationed);
  if (old.hero && old.hero.homeVillageId === tv.id && capital) old.hero.homeVillageId = capital.id;

  tv.ownerId = attacker.id;
  tv.isCapital = false;
  tv.loyalty = content.world.expansion.loyaltyAfterConquest;
  tv.buildQueue = [];
  tv.training = [];
  tv.research = { done: [], job: null };
  tv.armory = { levels: {}, job: null };
  tv.festival = null;
  tv.tribute = {};
  tv.troops = {};
  attacker.villageIds.push(tv.id);
  home.children.push(tv.id);
}

function annexOasis(state: GameState, content: Content, o: OasisState, attacker: Player, home: Village | null, report: BattleReportData, at: Ms) {
  if (!home || home.ownerId !== attacker.id) return;
  const inReach = villageClaims(state, content, home, o.tile);
  const hasSlot = oasisSlots(content, home) - home.oases.length > 0;
  if (o.ownerVillageId) {
    const prev = state.villages[o.ownerVillageId];
    const from = Math.round(o.loyalty);
    o.loyalty = Math.max(0, o.loyalty - content.hero.oasisLoyaltyPerAttack);
    report.loyalty = { from, to: Math.round(o.loyalty) };
    if (o.loyalty > 0) return;
    if (prev) {
      touch(state, content, prev, at);
      prev.oases = prev.oases.filter((t) => t !== o.tile);
    }
    o.ownerVillageId = null;
  }
  if (!inReach) {
    report.notes.push(`The oasis lies outside the territory of ${home.name}, so it cannot be annexed from there.`);
    return;
  }
  if (!hasSlot) {
    report.notes.push(`${home.name} has no free oasis slot. Raise its Heroon.`);
    return;
  }
  touch(state, content, home, at);
  o.ownerVillageId = home.id;
  o.loyalty = 100;
  o.animals = {};
  o.carry = {};
  home.oases.push(o.tile);
  report.annexed = true;
}

// --- scouting ----------------------------------------------------------------------

function resolveScout(state: GameState, content: Content, m: Movement, at: Ms): void {
  const target = targetAt(state, content, m.toTile);
  const { x, y } = tileXY(content, m.toTile);
  const label = placeLabel(state, content, m.toTile);
  let groups: DefenderGroup[] = [];
  let tv: Village | null = null;
  if (target.kind === "village") {
    tv = target.village!;
    touch(state, content, tv, at);
    groups = villageDefenders(state, content, tv);
  } else if (target.kind === "oasis") {
    const o = oasisAt(state, content, m.toTile, at)!;
    groups = oasisDefenders(state, content, o);
  }
  const attack = scoutPower(content, m.troops, m.armory, "attack") * scoutStatFactor(content, state.players[m.ownerId]);
  let defense = 0;
  const defenderScouts: Troops = {};
  for (const g of groups) {
    defense += scoutPower(content, g.troops, g.armory, "defense") * scoutStatFactor(content, g.ownerId ? state.players[g.ownerId] : undefined);
    for (const [u, n] of Object.entries(g.troops)) if (content.units[u]?.role === "scout") defenderScouts[u] = (defenderScouts[u] ?? 0) + n;
  }
  const r = resolveScouting(attack, defense, content.world.combat.scoutLossExponent);
  const losses = lossesAt(m.troops, r.lossRate);
  const survivors = addTroops({ ...m.troops }, losses, -1);
  const merged: Troops = {};
  for (const g of groups) addTroops(merged, g.troops);
  const info = r.success
    ? {
        resources: tv ? Object.fromEntries(content.resourceIds.map((id) => [id, Math.floor(tv!.resources[id] ?? 0)])) : null,
        troops: merged,
        wallLevel: tv ? wallLevel(content, tv) : 0,
        cacheProtection: tv && tv.kind === "player" ? Math.floor(hidden(state, content, tv)) : 0,
        buildings: tv
          ? tv.buildings.filter((b): b is NonNullable<typeof b> => !!b).map((b) => ({ name: content.buildings[b.id]?.name ?? b.id, level: b.level }))
          : [],
      }
    : null;
  const attackerSide = side(state, { ownerId: m.ownerId, villageId: m.homeVillageId, villageName: homeName(state, m.homeVillageId), factionId: m.factionId }, m.troops, losses);
  const data = {
    type: "scout" as const,
    target: { tile: m.toTile, x, y, label, villageId: tv?.id ?? null, oasis: target.kind === "oasis" },
    attacker: attackerSide,
    success: r.success,
    detected: r.detected,
    defenderScouts,
    defenderLosses: {},
    info,
  };
  addReport(state, at, "scout", `${homeName(state, m.homeVillageId)} scouts ${label}`, [m.ownerId], data);
  if (r.detected && tv) {
    addReport(state, at, "scout", `Scouts from ${homeName(state, m.homeVillageId)} seen at ${label}`, [tv.ownerId], { ...data, info: null });
  }
  sendHome(state, content, { ...homeArgs(m), troops: survivors, hero: false, mission: "scout" }, at);
}

// --- reinforcement, settling, returns, trade -----------------------------------------

function mergeStationed(list: Stationed[], m: Movement): Stationed {
  let g = list.find((s) => s.homeVillageId === m.homeVillageId && s.ownerId === m.ownerId);
  if (!g) {
    g = { homeVillageId: m.homeVillageId, ownerId: m.ownerId, factionId: m.factionId, troops: {}, armory: m.armory, hero: false };
    list.push(g);
  }
  addTroops(g.troops, m.troops);
  g.armory = { ...m.armory };
  if (m.hero) g.hero = true;
  return g;
}

function resolveReinforce(state: GameState, content: Content, m: Movement, at: Ms): void {
  const label = placeLabel(state, content, m.toTile);
  const bounce = (why: string) => {
    sendHome(state, content, { ...homeArgs(m), troops: m.troops, hero: m.hero, mission: "reinforce" }, at);
    addReport(state, at, "reinforcement", `Reinforcements turned back at ${label}`, [m.ownerId], { type: "simple", lines: [why], troops: m.troops, tile: m.toTile });
  };
  const hero = state.players[m.ownerId]?.hero;
  const tvId = state.occupancy[m.toTile];
  if (tvId) {
    const tv = state.villages[tvId]!;
    if (tv.id !== m.targetVillageId || tv.ownerId !== m.targetOwnerId) return bounce(`${tv.name} changed hands before they arrived.`);
    touch(state, content, tv, at);
    if (tv.id === m.homeVillageId) {
      addTroops(tv.troops, m.troops);
      if (m.hero && hero) {
        hero.status = "home";
        hero.where = null;
      }
      return;
    }
    mergeStationed(tv.stationed, m);
    if (m.hero && hero) {
      hero.status = "stationed";
      hero.where = `v:${tv.id}`;
    }
    addReport(state, at, "reinforcement", `Reinforcements reach ${tv.name}`, [m.ownerId, tv.ownerId], {
      type: "simple",
      lines: [`Troops from ${homeName(state, m.homeVillageId)} arrived in ${tv.name}${m.hero ? " with the hero" : ""}. The host now feeds them.`],
      troops: m.troops,
      tile: m.toTile,
    });
    return;
  }
  const o = oasisAt(state, content, m.toTile, at);
  const ownerVillage = o?.ownerVillageId ? state.villages[o.ownerVillageId] : undefined;
  if (!o || !ownerVillage || ownerVillage.ownerId !== m.ownerId) return bounce("The oasis is no longer yours.");
  touch(state, content, ownerVillage, at);
  mergeStationed(o.stationed, m);
  if (m.hero && hero) {
    hero.status = "stationed";
    hero.where = `o:${o.tile}`;
  }
}

function resolveSettle(state: GameState, content: Content, m: Movement, at: Ms): void {
  const player = state.players[m.ownerId]!;
  const home = state.villages[m.homeVillageId];
  const info = tileInfo(content, state.settings.seed, m.toTile);
  const label = `(${info.x}|${info.y})`;
  const goBack = (why: string) => {
    sendHome(state, content, { ...homeArgs(m), troops: m.troops, hero: false, carry: m.carry, mission: "settle" }, at);
    addReport(state, at, "settle", `Settlers turned back at ${label}`, [m.ownerId], { type: "simple", lines: [why], tile: m.toTile });
  };
  if (!home || home.ownerId !== player.id) return goBack("Their home town is lost.");
  if (!isFreeValley(state, content, m.toTile)) return goBack("Someone else settled the valley first.");
  if (inForeignTerritory(state, content, m.toTile, player.id)) return goBack("The valley now lies inside another town's territory.");
  const need = cultureForVillages(content, player.villageIds.length + 1);
  if (playerCulture(state, player) < need) return goBack(`You need ${need} culture points for another town.`);
  if (expansionSlots(content, home) - home.children.length <= 0) return goBack(`${home.name} has no free expansion slot.`);
  const v = createVillage(state, content, {
    ownerId: player.id,
    tile: m.toTile,
    name: `${info.regionName ?? "New"} Colony`,
    kind: "player",
    layout: info.layout ?? content.world.mapgen.layouts[0]!,
    isCapital: false,
    at,
    resources: { ...m.carry },
  });
  home.children.push(v.id);
  addReport(state, at, "settle", `${v.name} founded`, [m.ownerId], {
    type: "simple",
    lines: [`Your settlers from ${home.name} founded ${v.name} at ${label}${info.regionName ? ` in ${info.regionName}` : ""}.`],
    tile: m.toTile,
  });
}

function resolveReturn(state: GameState, content: Content, m: Movement, _at: Ms): void {
  const home = state.villages[m.homeVillageId];
  const player = state.players[m.ownerId];
  if (!home || !player || home.ownerId !== m.ownerId) return;
  addTroops(home.troops, m.troops);
  const cap = capacity(content, home);
  for (const [r, n] of Object.entries(m.carry)) home.resources[r] = Math.min(cap[r] ?? 0, (home.resources[r] ?? 0) + n);
  if (m.mission === "attack" || m.mission === "raid") player.looted += totalResources(m.carry);
  home.treasures += m.treasures;
  if (m.hero && player.hero) {
    player.hero.status = "home";
    player.hero.where = null;
  }
}

function resolveTrade(state: GameState, content: Content, m: Movement, at: Ms): void {
  const tv = m.targetVillageId ? state.villages[m.targetVillageId] : undefined;
  if (tv) {
    touch(state, content, tv, at);
    const cap = capacity(content, tv);
    for (const [r, n] of Object.entries(m.carry)) tv.resources[r] = Math.min(cap[r] ?? 0, (tv.resources[r] ?? 0) + n);
    addReport(state, at, "trade", `Merchants from ${homeName(state, m.homeVillageId)} reach ${tv.name}`, [m.ownerId, tv.ownerId], {
      type: "simple",
      lines: [`${m.merchants} merchant${m.merchants === 1 ? "" : "s"} delivered goods to ${tv.name}.`],
      resources: m.carry,
      tile: m.toTile,
    });
  }
  const home = state.villages[m.homeVillageId];
  if (!home) return;
  const back: Movement = {
    ...m,
    id: newId(state, "m"),
    seq: nextSeq(state),
    kind: "tradeReturn",
    fromTile: m.toTile,
    toTile: villageTile(content, home),
    targetVillageId: home.id,
    targetOwnerId: home.ownerId,
    carry: {},
    departAt: at,
    arriveAt: at + Math.max(1000, m.arriveAt - m.departAt || marchMs(state, content, null, m.toTile, villageTile(content, home), 10)),
    mission: "trade",
  };
  state.movements[back.id] = back;
}
