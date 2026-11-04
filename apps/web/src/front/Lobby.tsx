import { useRef, useState, type ReactNode } from "react";
import { calendarAt, heroView, reportsFor } from "@emporion/engine";
import { content } from "../content";
import { at, int } from "../format";
import { endWorld, readRecord, standing, worldName, worldsPlayed, type EndedWorld } from "../record";
import { LOBBY_PATH, goGame, goTo, type LobbyView } from "../route";
import { Session, type SaveFile } from "../session";
import { BrandLockup, art, factionName, portraitUrl } from "../ui";
import { REPO } from "./Landing";
import "./front.css";

// ---------------------------------------------------------------------------
// The lobby, in MASSALIA's frame: the header with the lion, then three
// columns. Left: the head of your house, the lobby's sections and your
// record. Centre: the world open in this browser and the calendar of worlds
// (a new one to found, the ones that ended). Right: the guides, the latest
// dispatches and the houses by population. Hall of fame and Settings share
// the left column. Everything is read from the local save and record.
// ---------------------------------------------------------------------------

const HERO_ART: Record<string, string> = { hellenes: "b-agora", celts: "b-stables", carthaginians: "b-harbor" };

function ordinal(n: number): string {
  const tail = n % 100;
  if (tail >= 11 && tail <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

const longDate = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const monthYear = (t: number) => new Date(t).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface LobbyProps {
  view: LobbyView;
  session: Session | null;
  onAbandon: () => void;
  onLoad: (s: Session) => void;
}

export function Lobby({ view, session, onAbandon, onLoad }: LobbyProps) {
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((n) => n + 1);
  const record = readRecord();
  const played = worldsPlayed(!!session);
  return (
    <LobbyFrame active={view} session={session}>
      <div className={`lobby-shell-grid${view === "worlds" ? "" : " lobby-shell-grid-two"}`}>
        <LeftColumn view={view} session={session} worldsPlayed={played} onChanged={refresh} />
        <div className="lobby-main">
          {view === "worlds" && <CentreColumn session={session} ended={record.ended} next={worldName(played + 1)} />}
          {view === "hall-of-fame" && <HallOfFame ended={record.ended} />}
          {view === "settings" && <Settings session={session} onAbandon={onAbandon} onLoad={onLoad} />}
        </div>
        {view === "worlds" && <RightColumn session={session} />}
      </div>
    </LobbyFrame>
  );
}

const BRAND_LABEL: Record<LobbyView, string> = { worlds: "Lobby", "hall-of-fame": "Hall of fame", settings: "Settings" };

function LobbyFrame({ active, session, children }: { active: LobbyView; session: Session | null; children: ReactNode }) {
  return (
    <main className="lobby-shell">
      <div className="lobby-bg-art" style={{ backgroundImage: `url("${new URL(art("front"), document.baseURI).href}")` }} aria-hidden="true" />
      <div className="lobby-bg-shade" aria-hidden="true" />
      <header className="lobby-header">
        <BrandLockup label={BRAND_LABEL[active]} onClick={() => goTo("/")} />
        <nav className="lobby-header-actions" aria-label="Lobby">
          <a
            className={`lobby-link${active === "worlds" ? " lobby-nav-active" : ""}`}
            href="#/lobby"
            aria-current={active === "worlds" ? "page" : undefined}
          >
            Lobby
          </a>
          <a className="lobby-link" href="#/">
            Front page
          </a>
          <a className="lobby-link" href={`${REPO}/blob/main/docs/DESIGN.md`} target="_blank" rel="noopener noreferrer">
            Guide
          </a>
          {session ? (
            <button className="lobby-btn lobby-btn-small lobby-btn-primary" type="button" onClick={() => goGame()}>
              Continue playing
            </button>
          ) : (
            <button className="lobby-btn lobby-btn-small lobby-btn-primary" type="button" onClick={() => goTo("/create")}>
              Found your house
            </button>
          )}
        </nav>
      </header>
      {children}
      <footer className="lobby-footer">
        <nav aria-label="About">
          <a href={`${REPO}/blob/main/docs/DESIGN.md`} target="_blank" rel="noopener noreferrer">
            How it works
          </a>
          <a href={`${REPO}/blob/main/docs/RULINGS.md`} target="_blank" rel="noopener noreferrer">
            Game rules
          </a>
          <a href={REPO} target="_blank" rel="noopener noreferrer">
            Source
          </a>
        </nav>
        <small>© 300 BC – MMXXVI · EMPORION · ON MASSALIA&apos;S MAP</small>
      </footer>
    </main>
  );
}

function SectionHeading({ id, eyebrow, title }: { id: string; eyebrow: string; title: string }) {
  return (
    <div className="lobby-section-head">
      <p className="lobby-eyebrow">{eyebrow}</p>
      <h2 id={id}>{title}</h2>
    </div>
  );
}

// --- left: the head of the house, the sections, the record ----------------------

const LEFT_NAV: { view: LobbyView; label: string }[] = [
  { view: "worlds", label: "Game worlds" },
  { view: "hall-of-fame", label: "Hall of fame" },
  { view: "settings", label: "Settings" },
];

function LeftColumn({ view, session, worldsPlayed, onChanged }: { view: LobbyView; session: Session | null; worldsPlayed: number; onChanged: () => void }) {
  return (
    <aside className="lobby-aside-left">
      <CharacterCard session={session} onChanged={onChanged} />
      <nav className="lobby-nav" aria-label="Lobby sections">
        {LEFT_NAV.map((item) => (
          <a key={item.view} className={`lobby-nav-item${item.view === view ? " lobby-nav-item-active" : ""}`} href={`#${LOBBY_PATH[item.view]}`} aria-current={item.view === view ? "page" : undefined}>
            <span className="lobby-nav-dot" aria-hidden="true" />
            {item.label}
          </a>
        ))}
      </nav>
      <RecordPanel session={session} worldsPlayed={worldsPlayed} />
    </aside>
  );
}

function CharacterCard({ session, onChanged }: { session: Session | null; onChanged: () => void }) {
  const [picking, setPicking] = useState(false);
  if (!session) {
    return (
      <section className="lobby-panel lobby-character" aria-label="Your house">
        <img className="lobby-portrait lobby-character-portrait lobby-character-lion" src={art("lion")} alt="" width={132} height={132} />
        <h2 className="lobby-character-name">No house in this world</h2>
        <p className="lobby-character-meta">Found one to take a seat.</p>
      </section>
    );
  }
  const now = session.now();
  const p = session.player;
  const hero = heroView(session.state, content, p, now);
  const h = p.house;
  return (
    <section className="lobby-panel lobby-character" aria-label="Your house">
      {hero?.portrait ? (
        <img className="lobby-portrait lobby-character-portrait" src={portraitUrl(hero.portrait)} alt="" width={132} height={132} />
      ) : (
        <span className="lobby-portrait lobby-portrait-letter lobby-character-portrait" style={{ width: 132, height: 132, fontSize: 56 }} aria-hidden="true">
          {p.name.charAt(0)}
        </span>
      )}
      <h2 className="lobby-character-name">{p.name}</h2>
      {h && (
        <p className="lobby-character-dynasty">
          {h.name} · {ordinal(h.generation)} generation
        </p>
      )}
      <p className="lobby-character-meta">
        {factionName(p.factionId)} · Since {monthYear(session.state.settings.startedAt)}
      </p>
      {h && (
        <button className="lobby-btn lobby-btn-small lobby-character-face" type="button" onClick={() => setPicking(true)}>
          Change face
        </button>
      )}
      {picking && hero?.portrait && (
        <FacePicker
          current={h!.head.portrait}
          stage={hero.portrait.slice(hero.portrait.lastIndexOf("-") + 1)}
          onClose={() => setPicking(false)}
          onPick={(face) => {
            const r = session.game.choosePortrait(session.active, face, session.now());
            if (r.ok) session.save();
            setPicking(false);
            onChanged();
          }}
        />
      )}
    </section>
  );
}

// The head's face, chosen again among the portraits, shown at his present age.
function FacePicker({ current, stage, onClose, onPick }: { current: string; stage: string; onClose: () => void; onPick: (face: string) => void }) {
  return (
    <div className="creation-sheet-backdrop" onMouseDown={onClose}>
      <section className="creation-sheet lobby-face-sheet" role="dialog" aria-modal="true" aria-labelledby="lobby-face-title" onMouseDown={(e) => e.stopPropagation()}>
        <span className="creation-sheet-handle" aria-hidden="true" />
        <div className="creation-sheet-body">
          <p className="section-eyebrow">The head of your house</p>
          <h2 id="lobby-face-title">Choose a face</h2>
          {content.family.head.ageOptions.map((o) => (
            <div key={o.age} className="lobby-face-group">
              <p className="lobby-subhead">{o.label.replace(/\s*\(\d+\)$/, "")} faces</p>
              <div className="creation-face-grid">
                {o.faces.map((f, i) => (
                  <button key={f} type="button" className={`creation-face${f === current ? " selected" : ""}`} aria-pressed={f === current} aria-label={`Face ${i + 1}`} onClick={() => onPick(f)}>
                    <img src={portraitUrl(`${f}-${stage}`)} alt="" width={168} height={168} loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <footer className="creation-sheet-footer">
          <button className="creation-ghost-button" type="button" onClick={onClose}>
            Keep this face
          </button>
        </footer>
      </section>
    </div>
  );
}

function RecordPanel({ session, worldsPlayed }: { session: Session | null; worldsPlayed: number }) {
  const st = session ? standing(session) : null;
  const p = session?.player;
  return (
    <section className="lobby-panel lobby-record" aria-labelledby="lobby-record-title">
      <p className="lobby-eyebrow" id="lobby-record-title">
        Your record
      </p>
      <dl className="lobby-record-rows">
        <div>
          <dt>Worlds played</dt>
          <dd>{worldsPlayed}</dd>
        </div>
        <div>
          <dt>Population rank</dt>
          <dd>{st && st.rank > 0 ? `${st.rank} of ${st.of}` : "No house yet"}</dd>
        </div>
        <div>
          <dt>Towns held</dt>
          <dd>{p ? p.villageIds.length : "None yet"}</dd>
        </div>
        <div>
          <dt>Prestige</dt>
          <dd>{p?.profile ? int(p.profile.stats["prestige"] ?? 0) : "None yet"}</dd>
        </div>
      </dl>
    </section>
  );
}

// --- centre: the open world and the calendar ------------------------------------------

function CentreColumn({ session, ended, next }: { session: Session | null; ended: EndedWorld[]; next: string }) {
  return (
    <>
      <div className="lobby-worlds-head">
        <p className="lobby-eyebrow lobby-worlds-eyebrow">Worlds</p>
        <h2 className="lobby-worlds-title">The Western Sea</h2>
      </div>
      {session ? <HeroCard session={session} /> : <NewWorldCard />}
      <section className="lobby-calendar" aria-labelledby="lobby-calendar-title">
        <h3 className="lobby-calendar-title" id="lobby-calendar-title">
          Calendar
        </h3>
        <div className="lobby-calendar-grid">
          {session && (
            <article className="lobby-panel lobby-cal-card">
              <div className="lobby-cal-head">
                <h4>{next}</h4>
                <span className="lobby-pill lobby-pill-announced">Ready</span>
              </div>
              <img className="lobby-cal-art" src={art("b-oikist_house")} alt="" loading="lazy" />
              <p className="lobby-cal-line">A new world, a new house. {session.name} goes into the hall of fame.</p>
              <button className="lobby-btn lobby-cal-btn" type="button" onClick={() => goTo("/create")}>
                Found a new house
              </button>
            </article>
          )}
          {ended.slice(0, session ? 3 : 4).map((w, i) => (
            <article className="lobby-panel lobby-cal-card" key={`${w.name}-${w.endedAt}-${i}`}>
              <div className="lobby-cal-head">
                <h4>{w.name}</h4>
                <span className="lobby-pill lobby-pill-ended">Ended</span>
              </div>
              <img className="lobby-cal-art lobby-cal-art-ended" src={art("banner-court")} alt="" loading="lazy" />
              <p className="lobby-cal-line">
                closed on {longDate(w.endedAt)} · {count(w.houses, "house", "houses")}
              </p>
              <button className="lobby-btn lobby-cal-btn" type="button" onClick={() => goTo("/lobby/hall-of-fame")}>
                Hall of fame
              </button>
            </article>
          ))}
          {!session && ended.length === 0 && <p className="lobby-empty">No world has been played in this browser yet.</p>}
        </div>
      </section>
    </>
  );
}

// The world open in this browser: its name and OPEN NOW in the head bar, a
// painting of your people beside the facts, one action in the foot.
function HeroCard({ session }: { session: Session }) {
  const now = session.now();
  const p = session.player;
  const cal = calendarAt(session.state, content, now);
  const st = standing(session);
  const capital = p.capitalId ? session.state.villages[p.capitalId] : undefined;
  return (
    <section className="lobby-panel lobby-hero" aria-label={session.name}>
      <div className="lobby-hero-head">
        <h3 className="lobby-hero-name">
          <span className="lobby-pulse" aria-hidden="true" />
          {session.name}
        </h3>
        <span className="lobby-pill">Open now</span>
      </div>
      <div className="lobby-hero-body">
        <div className="lobby-hero-art" style={{ backgroundImage: `url("${new URL(art(HERO_ART[p.factionId] ?? "b-prytaneion"), document.baseURI).href}")` }}>
          <p className="lobby-hero-tagline">
            {factionName(p.factionId)}
            {capital ? ` of ${capital.name}` : ""}
          </p>
        </div>
        <dl className="lobby-hero-facts">
          <div>
            <dt>In-game date</dt>
            <dd>{cal.label}</dd>
          </div>
          <div>
            <dt>World speed</dt>
            <dd>×{session.state.settings.speed}</dd>
          </div>
          <div>
            <dt>Houses</dt>
            <dd>{st.of}</dd>
          </div>
          <div>
            <dt>Your rank</dt>
            <dd>{st.rank > 0 ? `${ordinal(st.rank)} by population` : "No house yet"}</dd>
          </div>
        </dl>
      </div>
      <div className="lobby-hero-foot">
        <button className="lobby-btn lobby-btn-primary lobby-hero-cta" type="button" onClick={() => goGame()}>
          Continue playing
        </button>
      </div>
    </section>
  );
}

function NewWorldCard() {
  return (
    <section className="lobby-panel lobby-hero" aria-label="A new world">
      <div className="lobby-hero-head">
        <h3 className="lobby-hero-name">
          <span className="lobby-pulse" aria-hidden="true" />A new world
        </h3>
        <span className="lobby-pill">Ready</span>
      </div>
      <div className="lobby-hero-body">
        <div className="lobby-hero-art" style={{ backgroundImage: `url("${new URL(art("b-harbor"), document.baseURI).href}")` }}>
          <p className="lobby-hero-tagline">The western sea, 300 BC</p>
        </div>
        <dl className="lobby-hero-facts">
          <div>
            <dt>The map</dt>
            <dd>{(content.map.width * content.map.height).toLocaleString("en-US")} hexes</dd>
          </div>
          <div>
            <dt>Free cities</dt>
            <dd>{content.map.towns.length}</dd>
          </div>
          <div>
            <dt>Peoples</dt>
            <dd>{content.factionList.filter((f) => f.playable).length}</dd>
          </div>
          <div>
            <dt>Your seat</dt>
            <dd>None yet</dd>
          </div>
        </dl>
      </div>
      <div className="lobby-hero-foot">
        <button className="lobby-btn lobby-btn-primary lobby-hero-cta" type="button" onClick={() => goTo("/create")}>
          Found your house
        </button>
      </div>
    </section>
  );
}

// --- right: guides, dispatches, citizens ------------------------------------------------

function RightColumn({ session }: { session: Session | null }) {
  const latest = session ? reportsFor(session.state, session.active).slice(0, 3) : [];
  const now = session?.now() ?? 0;
  const citizens = session ? standing(session).rows.slice(0, 8) : [];
  return (
    <aside className="lobby-aside-right">
      <section className="lobby-panel lobby-guides-box" aria-label="Guide">
        <img className="lobby-guides-thumb" src={art("banner-ledger")} alt="" width={56} height={56} loading="lazy" />
        <div className="lobby-guides-copy">
          <h3>Guide</h3>
          <p>How the towns, the house, the agora and the map work, in one place.</p>
          <a className="lobby-guides-link" href={`${REPO}/blob/main/docs/DESIGN.md`} target="_blank" rel="noopener noreferrer">
            Open the guide →
          </a>
        </div>
      </section>

      <section className="lobby-panel lobby-guides-box" aria-label="Game rules">
        <div className="lobby-guides-copy">
          <h3>Game rules</h3>
          <p>Every number and every call made so far, waiting for the designer&apos;s word.</p>
          <a className="lobby-guides-link" href={`${REPO}/blob/main/docs/RULINGS.md`} target="_blank" rel="noopener noreferrer">
            Read the rules →
          </a>
        </div>
      </section>

      <section className="lobby-panel lobby-dispatches" aria-labelledby="lobby-dispatches-title">
        <div className="lobby-panel-head">
          <p className="lobby-eyebrow" id="lobby-dispatches-title">
            Dispatches
          </p>
          {session && (
            <a className="lobby-panel-head-link" href="#map">
              To the game
            </a>
          )}
        </div>
        {latest.length ? (
          <ul className="lobby-dispatch-list">
            {latest.map((r) => (
              <li key={r.id}>
                <time>{at(r.at, session!.state.settings.startedAt)}</time>
                <a href="#map">{r.title}</a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="lobby-empty lobby-panel-empty">Nothing filed yet.</p>
        )}
      </section>

      <section className="lobby-panel lobby-citizens" aria-labelledby="lobby-citizens-title">
        <div className="lobby-panel-head">
          <p className="lobby-eyebrow" id="lobby-citizens-title">
            Houses
          </p>
          <span className="lobby-panel-head-note">by population</span>
        </div>
        {citizens.length ? (
          <ol className="lobby-citizen-list">
            {citizens.map((c, i) => {
              const p = session!.state.players[c.playerId];
              const face = p ? heroView(session!.state, content, p, now)?.portrait : null;
              return (
                <li className={`lobby-citizen${c.playerId === session!.active ? " lobby-citizen-you" : ""}`} key={c.playerId}>
                  <span className="lobby-citizen-rank">{ordinal(i + 1)}</span>
                  {face ? (
                    <img className="lobby-portrait" src={portraitUrl(face)} alt="" width={40} height={40} loading="lazy" />
                  ) : (
                    <span className="lobby-portrait lobby-portrait-letter" style={{ width: 40, height: 40, fontSize: 17 }} aria-hidden="true">
                      {c.name.charAt(0)}
                    </span>
                  )}
                  <span className="lobby-citizen-body">
                    <strong>{c.name}</strong>
                    <span>{[c.house, factionName(c.factionId)].filter(Boolean).join(" · ")}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="lobby-empty lobby-panel-empty">No houses yet.</p>
        )}
      </section>
    </aside>
  );
}

// --- hall of fame ---------------------------------------------------------------------

function HallOfFame({ ended }: { ended: EndedWorld[] }) {
  return (
    <section className="lobby-panel lobby-subview" aria-labelledby="lobby-hall-title">
      <SectionHeading id="lobby-hall-title" eyebrow="Hall of Fame" title="Worlds that were" />
      {ended.length ? (
        <div className="lobby-hall">
          {ended.map((w, i) => (
            <article className="lobby-panel lobby-hall-card" key={`${w.name}-${w.endedAt}-${i}`}>
              <h3>{w.name}</h3>
              {w.you && (
                <p className="lobby-tagline">
                  {w.you.name}
                  {w.you.house ? ` of the ${w.you.house}` : ""}, {factionName(w.you.factionId)}
                </p>
              )}
              <p className="lobby-row-meta">
                {longDate(w.startedAt)} to {longDate(w.endedAt)} · {count(w.houses, "house", "houses")} · ×{w.speed} · left in {w.gameDate}
              </p>
              {w.you && (
                <div className="lobby-hall-you">
                  {w.you.portrait && <img className="lobby-portrait" src={portraitUrl(w.you.portrait)} alt="" width={44} height={44} loading="lazy" />}
                  <p>
                    Finished {ordinal(w.you.rank)} of {w.you.of} · {int(w.you.population)} people · {count(w.you.towns, "town", "towns")} · {ordinal(w.you.generation)} generation
                  </p>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="lobby-empty">No world has ended yet.</p>
      )}
    </section>
  );
}

// --- settings: the save in this browser ----------------------------------------------------

function Settings({ session, onAbandon, onLoad }: { session: Session | null; onAbandon: () => void; onLoad: (s: Session) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const size = session ? Math.round(JSON.stringify(session.toSave()).length / 1024) : 0;

  const download = () => {
    if (!session) return;
    const blob = new Blob([JSON.stringify(session.toSave())], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${session.name.toLowerCase().replace(/\s+/g, "-")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const load = async (f: File | undefined) => {
    if (!f) return;
    try {
      const s = Session.fromSave(JSON.parse(await f.text()) as SaveFile);
      if (!s) throw new Error("not a save");
      setNote("");
      onLoad(s);
    } catch {
      setNote("That file is not an EMPORION save.");
    } finally {
      if (file.current) file.current.value = "";
    }
  };

  return (
    <section className="lobby-panel lobby-subview" aria-labelledby="lobby-settings-title">
      <SectionHeading id="lobby-settings-title" eyebrow="Settings" title="Your world" />
      <div className="lobby-setting">
        <span className="lobby-setting-label">Saved in this browser</span>
        <span className="lobby-setting-value">{session ? `${session.name} · ${size} KB` : "No world"}</span>
      </div>
      <div className="lobby-setting">
        <span className="lobby-setting-label">Download the save</span>
        <button className="lobby-btn lobby-btn-small" type="button" disabled={!session} onClick={download}>
          Download
        </button>
      </div>
      <div className="lobby-setting">
        <span className="lobby-setting-label">Load a save</span>
        <span className="lobby-setting-value">
          <input ref={file} id="lobby-load" className="visually-hidden" type="file" accept="application/json,.json" onChange={(e) => void load(e.target.files?.[0])} />
          <label className="lobby-btn lobby-btn-small lobby-file" htmlFor="lobby-load">
            Choose a file
          </label>
        </span>
      </div>
      <p className="lobby-note">Loading a save replaces the world in this browser.</p>
      {note && (
        <p className="lobby-note lobby-note-error" role="alert">
          {note}
        </p>
      )}
      {session &&
        (confirming ? (
          <div className="lobby-danger">
            <p className="lobby-note">
              {session.name} goes into the hall of fame and its save is deleted from this browser, for good. Download it first to keep a copy.
            </p>
            <div className="lobby-danger-actions">
              <button className="lobby-btn lobby-btn-small" type="button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button
                className="lobby-btn lobby-btn-small lobby-btn-danger"
                type="button"
                onClick={() => {
                  endWorld(session);
                  onAbandon();
                }}
              >
                Abandon the world
              </button>
            </div>
          </div>
        ) : (
          <div className="lobby-setting">
            <span className="lobby-setting-label">Abandon this world</span>
            <button className="lobby-btn lobby-btn-small lobby-btn-danger" type="button" onClick={() => setConfirming(true)}>
              Abandon
            </button>
          </div>
        ))}
    </section>
  );
}
