import { Game, type GameState, type Result } from "@emporion/engine";
import { content } from "./content";

// ---------------------------------------------------------------------------
// The local host. It owns the Game, a game clock that can run faster than real
// time (or stop), the human players sharing this screen, and the save in
// localStorage. A server-backed client would keep the same surface and send
// each command over the wire instead of running it here.
// ---------------------------------------------------------------------------

// v2: the hex map. Saves from the square map (v1) place towns on tiles that
// no longer exist, so they are dropped and a new world starts.
const SAVE_KEY = "emporion.save.v2";
const OLD_KEYS = ["emporion.save.v1"];

export interface Clock {
  game: number; // game time at `real`
  real: number; // wall-clock anchor
  warp: number; // game seconds per real second
  paused: boolean;
}

export interface SaveFile {
  v: 2;
  state: GameState;
  clock: Clock;
  active: string;
  humans: string[];
  village: Record<string, string>;
}

export interface NewGameOptions {
  playerName: string;
  factionId: string;
  speed: number;
  rivals: number;
  npcRaids: boolean;
}

export interface Toast {
  text: string;
  kind: "ok" | "error";
  id: number;
}

const RIVALS: Record<string, string[]> = {
  hellenes: ["Euthymenes", "Pytheas", "Aristoxene", "Nikias", "Lysandros"],
  celts: ["Catumandus", "Nannos", "Comanus", "Brennos", "Ambiorix"],
  carthaginians: ["Himilco", "Hanno", "Bomilcar", "Mago", "Sophonisba"],
};

export class Session {
  version = 0;
  toast: Toast | null = null;
  private listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly game: Game,
    public clock: Clock,
    public active: string,
    public humans: string[],
    public village: Record<string, string>,
  ) {}

  static create(opts: NewGameOptions): Session {
    const start = Math.floor(Date.now() / 1000) * 1000;
    const game = Game.create(content, {
      startedAt: start,
      speed: opts.speed,
      npcRaids: opts.npcRaids,
      seed: Math.floor(Math.random() * 2 ** 31),
    });
    const me = game.join({ name: opts.playerName.trim() || "Protis", factionId: opts.factionId, at: start });
    const factions = content.factionList.filter((f) => f.playable).map((f) => f.id);
    for (let i = 0; i < opts.rivals; i++) {
      const factionId = factions[i % factions.length]!;
      const name = RIVALS[factionId]?.[Math.floor(i / factions.length)] ?? `Rival ${i + 1}`;
      game.join({ name, factionId, kind: "ai", at: start });
    }
    const s = new Session(game, { game: start, real: Date.now(), warp: 1, paused: false }, me.player.id, [me.player.id], { [me.player.id]: me.village.id });
    s.save();
    return s;
  }

  static load(): Session | null {
    try {
      for (const k of OLD_KEYS) localStorage.removeItem(k);
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return Session.fromSave(JSON.parse(raw) as SaveFile);
    } catch {
      return null;
    }
  }

  static fromSave(save: SaveFile): Session | null {
    if (!save || save.v !== 2 || !save.state) return null;
    const game = Game.restore(content, save.state);
    // Time passed while the page was closed counts at the saved warp, capped
    // at one real hour so a forgotten tab does not skip a week of game time.
    const away = Math.min(Date.now() - save.clock.real, 3_600_000);
    const clock = { ...save.clock, game: save.clock.paused ? save.clock.game : save.clock.game + away * save.clock.warp, real: Date.now() };
    return new Session(game, clock, save.active, save.humans, save.village ?? {});
  }

  static clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  get state() {
    return this.game.state;
  }

  get player() {
    return this.state.players[this.active]!;
  }

  get villageId(): string {
    const chosen = this.village[this.active];
    if (chosen && this.player.villageIds.includes(chosen)) return chosen;
    return this.player.capitalId ?? this.player.villageIds[0]!;
  }

  now(): number {
    const c = this.clock;
    if (c.paused) return c.game;
    return Math.floor(c.game + (Date.now() - c.real) * c.warp);
  }

  private rebase() {
    this.clock = { ...this.clock, game: this.now(), real: Date.now() };
  }

  setWarp(warp: number) {
    this.rebase();
    this.clock.warp = warp;
    this.tick();
    this.saveSoon();
  }

  togglePause() {
    this.rebase();
    this.clock.paused = !this.clock.paused;
    this.tick();
    this.saveSoon();
  }

  skip(ms: number) {
    this.rebase();
    this.clock.game += ms;
    this.tick();
    this.saveSoon();
  }

  tick() {
    this.game.advance(this.now(), this.active);
    this.bump();
  }

  selectVillage(id: string) {
    this.village[this.active] = id;
    this.bump();
    this.saveSoon();
  }

  switchPlayer(id: string) {
    if (!this.humans.includes(id)) return;
    this.active = id;
    this.tick();
    this.saveSoon();
  }

  addHuman(name: string, factionId: string) {
    const now = this.now();
    const { player, village } = this.game.join({ name: name.trim() || "Guest", factionId, at: now });
    this.humans.push(player.id);
    this.village[player.id] = village.id;
    this.active = player.id;
    this.tick();
    this.saveSoon();
  }

  // Run a command at the current game time; failures become a toast.
  run<T extends object>(fn: (g: Game, now: number) => Result<T>, okText?: string): Result<T> {
    const now = this.now();
    const r = fn(this.game, now);
    this.game.advance(now, this.active);
    if (!r.ok) this.notify(r.message, "error");
    else if (okText) this.notify(okText, "ok");
    this.bump();
    this.saveSoon();
    return r;
  }

  notify(text: string, kind: Toast["kind"]) {
    this.toast = { text, kind, id: (this.toast?.id ?? 0) + 1 };
    this.bump();
  }

  dismissToast() {
    this.toast = null;
    this.bump();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = () => this.version;

  private bump() {
    this.version++;
    for (const l of this.listeners) l();
  }

  toSave(): SaveFile {
    return { v: 2, state: this.state, clock: { ...this.clock, game: this.now(), real: Date.now() }, active: this.active, humans: this.humans, village: this.village };
  }

  saveSoon() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, 1500);
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.toSave()));
    } catch {
      /* storage full or unavailable: the game still runs */
    }
  }
}
