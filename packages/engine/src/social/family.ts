import type { Content } from "../content/load.js";
import type { FamilyTraitDef } from "../content/schema.js";
import { newId, nextSeq } from "../core/ids.js";
import { nextRandom, randomInt } from "../core/rng.js";
import { fail, ok, type Result } from "../core/result.js";
import type { GameState, House, Ms, Person, Player, Sex } from "../core/types.js";
import { capacity } from "../village/stats.js";
import { touchId } from "../village/timeline.js";
import { ageAt, calendarAt, yearIndexAt, yearMs } from "../world/calendar.js";
import { addReport } from "./reports.js";

// ---------------------------------------------------------------------------
// The family, ported from MASSALIA's family pack and seated on the hero: the
// hero is the head of a house. The head ages on the world calendar (a game
// year is four seasons), weakens with age, and dies of old age. Each year the
// house draws three bride candidates while the head is unwed; a wife may bear
// a child each year (fewer from the third), and may die in childbirth or of
// old age. Children come of age at 15. When the head dies, the eldest son of
// age inherits (half the hero's experience), else the adopted heir, else a
// regent holds the house for a minor son, else the house adopts. The new head
// takes up the hero. A hero who falls in battle is revived as before; only old
// age ends a head of house.
// ---------------------------------------------------------------------------

export function familyEnabled(content: Content): boolean {
  return content.family.enabled && content.hero.enabled;
}

export function personAge(state: GameState, content: Content, p: Person, t: Ms): number {
  return ageAt(state, content, p.bornAt, Math.min(t, p.diedAt ?? t));
}

export function alive(p: Person | null | undefined): p is Person {
  return !!p && p.diedAt === null;
}

function highest<T extends { fromAge: number }>(items: T[], age: number): T {
  let best = items[0]!;
  for (const it of items) if (it.fromAge <= age && it.fromAge >= best.fromAge) best = it;
  return best;
}

export function lifeStage(content: Content, age: number) {
  return highest(content.family.lifeStages, age);
}

// The portrait file stem (without .webp) for a person at an age: the child
// set until coming of age, then their own adult set by age stage.
export function portraitFile(content: Content, p: Person, age: number): string {
  const f = content.family;
  if (age < f.comingOfAge) {
    return `${p.sex === "male" ? f.portraits.boy : f.portraits.girl}-${highest(f.childStages, age).stage}`;
  }
  return `${p.portrait}-${highest(f.portraitStages, age).stage}`;
}

export function traitOf(content: Content, p: Person | null | undefined): FamilyTraitDef | null {
  return p?.traitId ? content.familyTraits[p.traitId] ?? null : null;
}

// --- people ----------------------------------------------------------------------

function namePool(content: Content, factionId: string, sex: Sex): string[] {
  const pools = content.family.names;
  const pool = pools[factionId] ?? Object.values(pools)[0];
  return (sex === "male" ? pool?.male : pool?.female) ?? ["Nameless"];
}

function familyNames(h: House | null): Set<string> {
  const out = new Set<string>();
  if (!h) return out;
  for (const p of [h.head, h.spouse, ...h.children, ...h.kin, h.adoptedHeir]) if (alive(p)) out.add(p.name);
  return out;
}

function drawName(state: GameState, content: Content, factionId: string, sex: Sex, exclude: Set<string>): string {
  const pool = namePool(content, factionId, sex);
  const free = pool.filter((n) => !exclude.has(n));
  const from = free.length ? free : pool;
  return from[Math.floor(nextRandom(state) * from.length)]!;
}

function drawPortrait(state: GameState, content: Content, sex: Sex): string {
  const pool = sex === "male" ? content.family.portraits.male : content.family.portraits.female;
  return pool[Math.floor(nextRandom(state) * pool.length)]!;
}

interface NewPerson {
  sex: Sex;
  age: number;
  name?: string;
  traitChance?: number;
  deathAge?: { min: number; max: number };
}

function makePerson(state: GameState, content: Content, player: Player, at: Ms, np: NewPerson): Person {
  const f = content.family;
  const exclude = familyNames(player.house);
  const traits = f.traits;
  const traitId = np.traitChance && traits.length && nextRandom(state) < np.traitChance ? traits[Math.floor(nextRandom(state) * traits.length)]!.id : null;
  const range = np.deathAge ?? (np.sex === "female" ? f.spouse.deathAge : f.head.deathAge);
  return {
    id: newId(state, "f"),
    name: np.name ?? drawName(state, content, player.factionId, np.sex, exclude),
    sex: np.sex,
    bornAt: Math.round(at - np.age * yearMs(state, content)),
    portrait: drawPortrait(state, content, np.sex),
    traitId,
    deathAge: randomInt(state, range.min, range.max),
    diedAt: null,
    cause: null,
  };
}

function drawCandidates(state: GameState, content: Content, player: Player, at: Ms): Person[] {
  const c = content.family.candidates;
  const out: Person[] = [];
  for (let i = 0; i < c.perDraw; i++) {
    out.push(makePerson(state, content, player, at, { sex: "female", age: randomInt(state, c.ageRange[0], c.ageRange[1]), traitChance: c.traitChance }));
  }
  return out;
}

function drawAdoptees(state: GameState, content: Content, player: Player, at: Ms): Person[] {
  const s = content.family.succession;
  const out: Person[] = [];
  for (let i = 0; i < content.family.adoption.perDraw; i++) {
    out.push(makePerson(state, content, player, at, { sex: "male", age: randomInt(state, s.adoptedAge[0], s.adoptedAge[1]) }));
  }
  return out;
}

function chronicle(h: House, at: Ms, text: string) {
  h.chronicle.push({ at, text });
  if (h.chronicle.length > 60) h.chronicle.splice(0, h.chronicle.length - 60);
}

function familyReport(state: GameState, player: Player, at: Ms, title: string, lines: string[]) {
  addReport(state, at, "family", title, [player.id], { type: "simple", lines });
}

// --- the house -----------------------------------------------------------------------

export function createHouse(state: GameState, content: Content, player: Player, headName: string, at: Ms): House {
  const f = content.family;
  const head = makePerson(state, content, player, at, { sex: "male", age: f.head.startAge, name: headName });
  const house: House = {
    name: `House of ${headName}`,
    generation: 1,
    head,
    headSince: at,
    headKind: "founder",
    spouse: null,
    children: [],
    kin: [],
    candidates: [],
    adoptees: [],
    adoptedHeir: null,
    regentFor: null,
    year: yearIndexAt(state, content, at),
    lineage: [],
    chronicle: [],
  };
  player.house = house;
  house.candidates = drawCandidates(state, content, player, at);
  chronicle(house, at, `${headName} founds the house.`);
  return house;
}

export function scheduleFamilyYear(state: GameState, content: Content, after: Ms): void {
  if (!familyEnabled(content)) return;
  if (state.scheduled.some((e) => e.kind === "familyYear")) return;
  const y = yearMs(state, content);
  const next = state.settings.startedAt + (yearIndexAt(state, content, after) + 1) * y;
  state.scheduled.push({ id: newId(state, "e"), seq: nextSeq(state), at: Math.round(next), kind: "familyYear" });
}

// Bring a save from before the family pack up to date.
export function ensureFamilies(state: GameState, content: Content, at: Ms): void {
  if (!familyEnabled(content)) return;
  for (const p of Object.values(state.players)) {
    if (p.kind === "npc" || p.house) continue;
    if (p.house === undefined) (p as { house: House | null }).house = null;
    createHouse(state, content, p, p.hero?.name ?? p.name, at);
  }
  scheduleFamilyYear(state, content, at);
}

// --- what the family gives the hero ----------------------------------------------------

export interface FamilyMods {
  strength: number; // fighting-strength multiplier from the head's age
  defenseBonus: number;
  xpBonus: number;
  cultureBonus: number; // in the hero's home town
}

export function familyMods(state: GameState, content: Content, player: Player | undefined, t: Ms): FamilyMods {
  const out: FamilyMods = { strength: 1, defenseBonus: 0, xpBonus: 0, cultureBonus: 0 };
  const h = player?.house;
  if (!h || !familyEnabled(content)) return out;
  out.strength = lifeStage(content, personAge(state, content, h.head, t)).strength;
  if (alive(h.spouse)) {
    const tr = traitOf(content, h.spouse);
    out.defenseBonus += tr?.heroDefenseBonus ?? 0;
    out.xpBonus += tr?.heroXpBonus ?? 0;
    out.cultureBonus += tr?.cultureBonus ?? 0;
  }
  return out;
}

// --- the year turns ----------------------------------------------------------------------

export function runFamilyYear(state: GameState, content: Content, at: Ms): void {
  const players = Object.values(state.players)
    .filter((p) => p.house && p.kind !== "npc")
    .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  for (const p of players) processHouse(state, content, p, at);
  scheduleFamilyYear(state, content, at);
}

function processHouse(state: GameState, content: Content, p: Player, at: Ms): void {
  const h = p.house!;
  const f = content.family;
  const year = yearIndexAt(state, content, at);
  if (h.year >= year) return;
  h.year = year;
  const age = (x: Person) => personAge(state, content, x, at);
  const home = p.hero?.homeVillageId;

  // The wife: old age, then the year's child roll.
  const wife = h.spouse;
  if (alive(wife) && age(wife) >= wife.deathAge) {
    touchId(state, content, home, at);
    wife.diedAt = at;
    wife.cause = "old age";
    chronicle(h, at, `${wife.name}, wife of ${h.head.name}, dies at ${age(wife)}.`);
    familyReport(state, p, at, `${wife.name} has died`, [`${wife.name}, wife of ${h.head.name}, died of old age at ${age(wife)}.`]);
  }
  if (alive(wife)) {
    const wAge = age(wife);
    const tr = traitOf(content, wife);
    if (wAge >= f.spouse.fertility.from && wAge <= f.spouse.fertility.to && h.children.length < f.children.max) {
      const base = h.children.length < 2 ? f.children.yearlyChance : f.children.thirdPlusChance;
      if (nextRandom(state) < base + (tr?.childChanceBonus ?? 0)) {
        const sex: Sex = nextRandom(state) < f.children.boys ? "male" : "female";
        const child = makePerson(state, content, p, at, { sex, age: 0 });
        h.children.push(child);
        const what = sex === "male" ? "son" : "daughter";
        chronicle(h, at, `A ${what}, ${child.name}, is born to ${h.head.name} and ${wife.name}.`);
        const lines = [`${wife.name} has given ${h.head.name} a ${what}: ${child.name}.`];
        if (nextRandom(state) < f.children.birthDeathRisk + (tr?.birthDeathRiskMod ?? 0)) {
          touchId(state, content, home, at);
          wife.diedAt = at;
          wife.cause = "childbirth";
          chronicle(h, at, `${wife.name} dies in childbirth.`);
          lines.push(`The birth cost ${wife.name} her life. The child lives.`);
        }
        familyReport(state, p, at, `A ${what} is born: ${child.name}`, lines);
      }
    }
  }

  // Children who come of age this year.
  for (const c of h.children) {
    if (!alive(c) || age(c) !== f.comingOfAge) continue;
    chronicle(h, at, `${c.name} comes of age.`);
    if (c.sex === "male") familyReport(state, p, at, `${c.name} comes of age`, [`${c.name}, ${h.head.name}'s son, is ${f.comingOfAge} and may now inherit the house.`]);
  }

  // A regency ends when the ward comes of age.
  if (h.regentFor) {
    const ward = h.children.find((c) => c.id === h.regentFor);
    if (!alive(ward)) h.regentFor = null;
    else if (age(ward) >= f.comingOfAge) {
      install(state, content, p, ward, "blood", at, "stepped down");
      return;
    }
  }

  // Old age takes the head.
  if (age(h.head) >= h.head.deathAge) {
    succeed(state, content, p, at, "old age");
    return;
  }

  if (!alive(h.spouse)) h.candidates = drawCandidates(state, content, p, at);
  const hasSon = h.children.some((c) => alive(c) && c.sex === "male");
  h.adoptees = !hasSon && !h.adoptedHeir ? drawAdoptees(state, content, p, at) : [];
}

export interface SuccessionPreview {
  kind: "blood" | "adopted" | "regent" | "forced";
  heir: Person | null; // the son or adoptee who would inherit (the ward, for a regency)
  carryover: number;
}

export function successionPreview(state: GameState, content: Content, p: Player, t: Ms): SuccessionPreview | null {
  const h = p.house;
  if (!h) return null;
  const f = content.family;
  const sons = h.children.filter((c) => alive(c) && c.sex === "male").sort((a, b) => a.bornAt - b.bornAt);
  const ofAge = sons.filter((c) => personAge(state, content, c, t) >= f.comingOfAge);
  if (ofAge[0]) return { kind: "blood", heir: ofAge[0], carryover: f.succession.xpCarryover.blood };
  if (h.adoptedHeir) return { kind: "adopted", heir: h.adoptedHeir, carryover: f.succession.xpCarryover.adopted };
  if (sons[0]) return { kind: "regent", heir: sons[0], carryover: f.succession.xpCarryover.regent };
  return { kind: "forced", heir: null, carryover: f.succession.xpCarryover.adopted };
}

function succeed(state: GameState, content: Content, p: Player, at: Ms, cause: string): void {
  const s = content.family.succession;
  const plan = successionPreview(state, content, p, at)!;
  let next: Person;
  if (plan.kind === "blood" || plan.kind === "adopted") next = plan.heir!;
  else next = makePerson(state, content, p, at, { sex: "male", age: randomInt(state, ...(plan.kind === "regent" ? s.regentAge : s.adoptedAge)) });
  install(state, content, p, next, plan.kind, at, cause, plan.kind === "regent" ? plan.heir!.id : null);
}

function levelForXp(content: Content, xp: number): number {
  let level = 0;
  while (level < content.hero.maxLevel && xp >= (content.hero.xpBase * (level + 1) * (level + 2)) / 2) level++;
  return level;
}

// Make `next` the head of the house and the player's hero.
function install(state: GameState, content: Content, p: Player, next: Person, kind: string, at: Ms, cause: string, regentFor: string | null = null): void {
  const h = p.house!;
  const hero = p.hero;
  const f = content.family;
  const old = h.head;
  const oldAge = personAge(state, content, old, at);
  h.lineage.push({ name: old.name, portrait: old.portrait, bornAt: old.bornAt, from: h.headSince, to: at, cause, kind: h.headKind, level: hero?.level ?? 0 });
  if (cause !== "stepped down") {
    old.diedAt = at;
    old.cause = cause;
  } else {
    h.kin.push(old);
  }

  // The old head leaves wherever he stood.
  if (hero) {
    touchId(state, content, hero.homeVillageId, at);
    if (hero.status === "moving" && hero.where && state.movements[hero.where]) state.movements[hero.where]!.hero = false;
    if (hero.status === "stationed" && hero.where) {
      const [kindKey, ref] = [hero.where.slice(0, 1), hero.where.slice(2)];
      const list = kindKey === "v" ? state.villages[ref]?.stationed : state.oases[Number(ref)]?.stationed;
      const g = list?.find((x) => x.ownerId === p.id && x.hero);
      if (g) g.hero = false;
    }
  }

  // Who stays with the house.
  const carry = kind === "blood" ? f.succession.xpCarryover.blood : kind === "regent" ? f.succession.xpCarryover.regent : f.succession.xpCarryover.adopted;
  if (alive(h.spouse)) h.kin.push(h.spouse);
  h.spouse = null;
  if (kind === "regent") {
    h.regentFor = regentFor;
  } else {
    for (const c of h.children) if (alive(c) && c.id !== next.id) h.kin.push(c);
    h.children = [];
    h.regentFor = null;
  }
  if (kind === "adopted") h.adoptedHeir = null;
  h.head = next;
  h.headSince = at;
  h.headKind = kind;
  h.generation += 1;
  h.candidates = drawCandidates(state, content, p, at);
  h.adoptees = [];

  if (hero) {
    const xp = Math.floor(hero.xp * carry);
    const level = levelForXp(content, xp);
    const capital = p.capitalId;
    const homeOk = state.villages[hero.homeVillageId]?.ownerId === p.id;
    hero.name = next.name;
    hero.xp = xp;
    hero.level = level;
    hero.points = { strength: 0, offense: 0, defense: 0, production: 0 };
    hero.unspent = content.hero.startPoints + level * content.hero.pointsPerLevel;
    hero.health = 100;
    hero.healthAt = at;
    hero.status = "home";
    hero.where = null;
    hero.reviveAt = null;
    if (!homeOk && capital) hero.homeVillageId = capital;
    touchId(state, content, hero.homeVillageId, at);
  }

  const how: Record<string, string> = {
    blood: "his son",
    adopted: "his adopted heir",
    regent: "a regent, until the heir comes of age,",
    forced: "a man the house adopted",
  };
  const verb = cause === "stepped down" ? `${old.name}'s regency ends` : `${old.name} died of ${cause} at ${oldAge}`;
  const line = `${verb}. ${next.name}, ${cause === "stepped down" ? "now of age," : how[kind] ?? ""} leads ${h.name}${hero ? ` as the new hero, keeping ${Math.round(carry * 100)}% of the experience` : ""}.`;
  chronicle(h, at, line);
  familyReport(state, p, at, cause === "stepped down" ? `${next.name} comes into the house` : `${old.name} is dead; ${next.name} succeeds`, [line]);
}

// --- commands --------------------------------------------------------------------------

export function marry(state: GameState, content: Content, playerId: string, candidateId: string, now: Ms): Result {
  const p = state.players[playerId];
  const h = p?.house;
  if (!p || !h) return fail("not_found", "You have no house.");
  if (alive(h.spouse)) return fail("invalid", `${h.head.name} is already married.`);
  const c = h.candidates.find((x) => x.id === candidateId);
  if (!c) return fail("not_found", "That match is no longer on offer.");
  touchId(state, content, p.hero?.homeVillageId, now);
  h.spouse = { ...c, marriedAt: now };
  h.candidates = [];
  chronicle(h, now, `${h.head.name} marries ${c.name}.`);
  const tr = traitOf(content, c);
  if (tr?.dowry && p.capitalId) {
    const cap = touchId(state, content, p.capitalId, now);
    if (cap) {
      const room = capacity(content, cap);
      for (const [r, n] of Object.entries(tr.dowry)) cap.resources[r] = Math.min(room[r] ?? 0, (cap.resources[r] ?? 0) + n);
      chronicle(h, now, `Her dowry fills the stores of ${cap.name}.`);
    }
  }
  return ok({});
}

export function nameChild(state: GameState, content: Content, playerId: string, childId: string, name: string): Result {
  const h = state.players[playerId]?.house;
  const c = h?.children.find((x) => x.id === childId);
  if (!h || !c || !alive(c)) return fail("not_found", "No such child.");
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 24);
  if (!clean) return fail("invalid", "A child needs a name.");
  c.name = clean;
  return ok({});
}

export function adopt(state: GameState, content: Content, playerId: string, candidateId: string, now: Ms): Result {
  const h = state.players[playerId]?.house;
  if (!h) return fail("not_found", "You have no house.");
  if (h.adoptedHeir) return fail("invalid", `${h.adoptedHeir.name} is already the adopted heir.`);
  const c = h.adoptees.find((x) => x.id === candidateId);
  if (!c) return fail("not_found", "That man is no longer on offer.");
  h.adoptedHeir = c;
  h.adoptees = [];
  chronicle(h, now, `${h.head.name} adopts ${c.name} as heir.`);
  return ok({});
}

// --- read model ------------------------------------------------------------------------------

export interface PersonView {
  id: string;
  name: string;
  sex: Sex;
  age: number;
  alive: boolean;
  portrait: string;
  stage: string;
  trait: FamilyTraitDef | null;
  cause: string | null;
  ofAge: boolean;
}

export interface FamilyView {
  name: string;
  generation: number;
  date: string;
  head: PersonView & { deathAgeHint: string; since: Ms; kind: string };
  spouse: (PersonView & { marriedAt: Ms }) | null;
  widowed: PersonView | null;
  children: PersonView[];
  kin: PersonView[];
  candidates: PersonView[];
  adoptees: PersonView[];
  adoptedHeir: PersonView | null;
  regentFor: PersonView | null;
  succession: { kind: string; heir: PersonView | null; carryover: number } | null;
  lineage: House["lineage"];
  chronicle: House["chronicle"];
  mods: FamilyMods;
}

export function familyView(state: GameState, content: Content, p: Player, t: Ms): FamilyView | null {
  const h = p.house;
  if (!h) return null;
  const pv = (x: Person): PersonView => {
    const age = personAge(state, content, x, t);
    return {
      id: x.id,
      name: x.name,
      sex: x.sex,
      age,
      alive: x.diedAt === null,
      portrait: portraitFile(content, x, age),
      stage: age < content.family.comingOfAge ? (x.sex === "male" ? "boy" : "girl") : lifeStage(content, age).name,
      trait: traitOf(content, x),
      cause: x.cause,
      ofAge: age >= content.family.comingOfAge,
    };
  };
  const plan = successionPreview(state, content, p, t);
  const ward = h.regentFor ? h.children.find((c) => c.id === h.regentFor) : undefined;
  const headAge = personAge(state, content, h.head, t);
  const stages = content.family.lifeStages;
  const nextStage = stages.filter((s) => s.fromAge > headAge).sort((a, b) => a.fromAge - b.fromAge)[0];
  return {
    name: h.name,
    generation: h.generation,
    date: calendarAt(state, content, t).label,
    head: { ...pv(h.head), deathAgeHint: nextStage ? `${nextStage.name} at ${nextStage.fromAge}` : "In the last years", since: h.headSince, kind: h.headKind },
    spouse: h.spouse && alive(h.spouse) ? { ...pv(h.spouse), marriedAt: h.spouse.marriedAt } : null,
    widowed: h.spouse && !alive(h.spouse) ? pv(h.spouse) : null,
    children: h.children.map(pv),
    kin: h.kin.filter((k) => alive(k)).map(pv),
    candidates: h.candidates.map(pv),
    adoptees: h.adoptees.map(pv),
    adoptedHeir: h.adoptedHeir ? pv(h.adoptedHeir) : null,
    regentFor: ward ? pv(ward) : null,
    succession: plan ? { kind: plan.kind, heir: plan.heir ? pv(plan.heir) : null, carryover: plan.carryover } : null,
    lineage: h.lineage,
    chronicle: h.chronicle.slice(-20).reverse(),
    mods: familyMods(state, content, p, t),
  };
}
