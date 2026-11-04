import { useEffect } from "react";
import {
  calendarAt,
  dayView,
  heroView,
  movementsFor,
  playerSummary,
  troopCount,
  villageSummary,
  type MovementView,
} from "@emporion/engine";
import { asset, content } from "./content";
import { duration, gameDate, int, signed } from "./format";
import { Icon } from "./icons";
import { useNav, type View } from "./nav";
import { goTo } from "./route";
import { Bar, Countdown, Portrait, ResIcon, art, factionName, useSession } from "./ui";

const WARPS = [1, 10, 100, 1000];

export function heroStatus(status: string): string {
  return { home: "at home", moving: "on the march", stationed: "stationed away", dead: "fallen", reviving: "reviving" }[status] ?? status;
}

// --- the top bar, as MASSALIA's: coin and wordmark, the season, boxes, the player ---

export function TopBar() {
  const s = useSession();
  const nav = useNav();
  const now = s.now();
  const cal = calendarAt(s.state, content, now);
  const me = playerSummary(s.state, content, s.player);
  const treasures = s.player.villageIds.reduce((n, id) => n + (s.state.villages[id]?.treasures ?? 0), 0);
  const hero = heroView(s.state, content, s.player, now);
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <button className="topbar__home" type="button" onClick={() => goTo("/lobby")} title="Back to the lobby" aria-label="Back to the lobby">
          <img className="coin" src={art("lion")} alt="" width={44} height={44} />
        </button>
        <div className="topbar__title">
          <button className="topbar__home wordmark" type="button" onClick={() => goTo("/lobby")} title="Back to the lobby">
            Emporion
          </button>
          <div className="topbar__date" title="Season and year on MASSALIA's calendar">
            <span className={`pulse${s.clock.paused ? " is-paused" : ""}`} aria-hidden />
            <span className="topbar__season">{cal.label}</span>
            <span className="topbar__day">· {gameDate(now, s.state.settings.startedAt)}</span>
          </div>
        </div>
      </div>
      <div className="topbar__clock" role="group" aria-label="Game clock">
        <button className={`chip${s.clock.paused ? " is-on" : ""}`} onClick={() => s.togglePause()}>
          {s.clock.paused ? "Resume" : "Pause"}
        </button>
        {WARPS.map((w) => (
          <button key={w} className={`chip${!s.clock.paused && s.clock.warp === w ? " is-on" : ""}`} onClick={() => s.setWarp(w)} title={`Run the clock ×${w}`}>
            ×{w}
          </button>
        ))}
        <button className="chip" onClick={() => s.skip(3_600_000)} title="Jump one game hour ahead">
          +1h
        </button>
      </div>
      <div className="topbar__boxes">
        <button className="box box--purse" onClick={() => nav.open({ kind: "market" })} title="Your purse · open the Agora">
          <Icon name="coin" size={18} />
          <span className="box__num">{int(s.player.purse)}</span>
          <span className="box__label">
            Drachmae
            <small>the Agora</small>
          </span>
        </button>
        {s.player.protectedUntil > now && (
          <div className="box box--shield" title="Other players cannot attack or raid you while this lasts. Outlaws and animals still can.">
            <Icon name="lock" size={18} />
            <span className="box__label">
              Protected
              <small>{duration(s.player.protectedUntil - now)}</small>
            </span>
          </div>
        )}
        <div className="box" title={`${int(me.culturePerDay)} culture points a day`}>
          <span className="box__num">{int(me.culture)}</span>
          <span className="box__label">
            Culture
            <small>of {int(me.cultureNext)} for a new town</small>
          </span>
        </div>
        <div className="box">
          <span className="box__num">{int(treasures)}</span>
          <span className="box__label">
            Treasures
            <small>{int(me.population)} people</small>
          </span>
        </div>
      </div>
      <button className="topbar__player" onClick={() => nav.open({ kind: "players" })} title="Players on this screen">
        <Portrait stem={hero?.portrait ?? null} size={44} />
        <span className="topbar__who">
          <span className="topbar__name">{s.player.name}</span>
          <span className="topbar__house">
            {s.player.house?.name ?? "No house"} · {factionName(s.player.factionId)}
          </span>
        </span>
      </button>
    </header>
  );
}

// --- top left: the town switcher ---------------------------------------------------

export function VillageSwitcher() {
  const s = useSession();
  const ids = s.player.villageIds;
  const v = s.state.villages[s.villageId]!;
  const i = ids.indexOf(v.id);
  const step = (d: number) => s.selectVillage(ids[(i + d + ids.length) % ids.length]!);
  return (
    <div className="hud-village">
      <button className="sq-btn" onClick={() => step(-1)} aria-label="Previous town" disabled={ids.length < 2}>
        <Icon name="left" size={16} />
      </button>
      <label className="hud-village__select">
        <span className="visually-hidden">Town</span>
        <select id="town-select" value={v.id} onChange={(e) => s.selectVillage(e.target.value)}>
          {ids.map((id) => {
            const t = s.state.villages[id]!;
            return (
              <option key={id} value={id}>
                {t.name}
                {t.isCapital ? " ★" : ""}
              </option>
            );
          })}
        </select>
        <span className="hud-village__coords">
          ({v.x}|{v.y})
        </span>
      </label>
      <button className="sq-btn" onClick={() => step(1)} aria-label="Next town" disabled={ids.length < 2}>
        <Icon name="right" size={16} />
      </button>
    </div>
  );
}

// --- top centre: the three views and the stores ---------------------------------------

// The map is the main view and comes first; then the town's resource fields
// and its buildings.
const VIEW_META: { id: View; label: string; img: string }[] = [
  { id: "map", label: "Map", img: "v-map" },
  { id: "fields", label: "Resources", img: "v-fields" },
  { id: "town", label: "Town", img: "v-town" },
];

export function ViewSwitch() {
  const nav = useNav();
  return (
    <nav className="views" aria-label="Views">
      {VIEW_META.map((m) => (
        <button key={m.id} className={`medallion${nav.view === m.id ? " is-on" : ""}`} onClick={() => nav.go(m.id)} aria-current={nav.view === m.id ? "page" : undefined}>
          <span className="medallion__ring">
            <img src={art(m.img)} alt="" />
          </span>
          <span className="medallion__label">{m.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function ResourceBanner() {
  const s = useSession();
  const v = s.state.villages[s.villageId]!;
  const sum = villageSummary(s.state, content, v);
  const food = content.food;
  const foodNet = sum.net[food] ?? 0;
  return (
    <div className="stores">
      <div className="stores__ribbon">
        <span className="stores__tail stores__tail--l" aria-hidden />
        <div className="stores__cells" aria-label="Stores">
          {content.resourceIds.map((r) => {
            const amt = sum.resources[r] ?? 0;
            const cap = sum.capacity[r] ?? 0;
            const rate = sum.net[r] ?? 0;
            const full = amt >= cap - 0.5;
            return (
              <div key={r} className={`store${full ? " is-full" : ""}${rate < 0 ? " is-negative" : ""}`} title={`${content.resources.find((x) => x.id === r)?.name}: ${signed(rate)} an hour`}>
                <ResIcon id={r} size={30} />
                <div className="store__body">
                  <span className="store__nums">
                    <span className="store__amt">{int(amt)}</span>
                    <span className="store__cap">/{int(cap)}</span>
                  </span>
                  <Bar value={amt} max={cap} tone={full ? "warn" : rate < 0 ? "danger" : "accent"} />
                  <span className="store__rate">{signed(rate)}</span>
                </div>
              </div>
            );
          })}
        </div>
        <span className="stores__tail stores__tail--r" aria-hidden />
      </div>
      {foodNet < 0 && (
        <p className="notice notice--bad">
          {(v.resources[food] ?? 0) < 1 ? "Troops are starving." : `Wheat runs out in ${duration(((v.resources[food] ?? 0) / -foodNet) * 3_600_000)}, then troops starve.`}
        </p>
      )}
    </div>
  );
}

// --- top right: the hero ------------------------------------------------------------------

export function HeroBadge() {
  const s = useSession();
  const nav = useNav();
  const now = s.now();
  const h = heroView(s.state, content, s.player, now);
  if (!h) return null;
  return (
    <button className={`hero-badge${h.alive ? "" : " is-fallen"}`} onClick={() => nav.open({ kind: "hero", tab: "profile" })} title={`${h.name}, ${heroStatus(h.status)} · open the Profile`}>
      <span className="hero-badge__face">
        <Portrait stem={h.portrait} size={86} dim={!h.alive} />
        <span className="hero-badge__level">{h.level}</span>
        {h.unspent > 0 && <span className="hero-badge__points" title="Points to spend">+{h.unspent}</span>}
      </span>
      <span className="hero-badge__name">{h.name}</span>
      <span className="hero-badge__age">
        {h.age !== null ? `${h.age} · ${h.lifeStage}` : heroStatus(h.status)}
      </span>
      <span className="hero-badge__bars">
        <Bar value={h.health} max={100} tone={h.health < 30 ? "danger" : "good"} />
        <Bar value={h.xp} max={h.xpNext} />
      </span>
    </button>
  );
}

// --- left: the tool column ---------------------------------------------------------------

export function ToolRail() {
  const s = useSession();
  const nav = useNav();
  const unread = Object.values(s.state.reports).filter((r) => r.unread.includes(s.active)).length;
  const incoming = movementsFor(s.state, content, s.active).filter((m) => m.hostile).length;
  const day = dayView(s.state, content, s.player, s.now());
  const dayOpen = !!day && !day.withdrawn && day.picked < day.picksPerSeason;
  const tools: { id: string; label: string; icon: string; badge?: number; open: () => void }[] = [
    { id: "troops", label: "Troops", icon: "troops", badge: incoming, open: () => nav.open({ kind: "troops" }) },
    { id: "reports", label: "Reports", icon: "reports", badge: unread, open: () => nav.open({ kind: "reports" }) },
    { id: "stats", label: "Standings", icon: "stats", open: () => nav.open({ kind: "stats" }) },
    { id: "market", label: "Market", icon: "scales", open: () => nav.open({ kind: "market" }) },
    { id: "profile", label: "Profile", icon: "profile", badge: dayOpen ? 1 : undefined, open: () => nav.open({ kind: "hero", tab: dayOpen ? "day" : "profile" }) },
    { id: "kingdom", label: "Kingdom", icon: "kingdom", open: () => nav.open({ kind: "kingdom" }) },
    { id: "family", label: "Family", icon: "family", open: () => nav.open({ kind: "hero", tab: "family" }) },
    { id: "players", label: "Players", icon: "people", open: () => nav.open({ kind: "players" }) },
  ];
  return (
    <nav className="rail" aria-label="Tools">
      {tools.map((t) => (
        <button key={t.id} className="rail__btn" onClick={t.open} title={t.label}>
          <Icon name={t.icon} size={22} />
          <span className="rail__label">{t.label}</span>
          {t.badge ? <span className={`rail__badge${t.id === "troops" ? " is-alarm" : ""}`}>{t.badge}</span> : null}
        </button>
      ))}
    </nav>
  );
}

// --- right: marches under way ---------------------------------------------------------------

function movementLabel(m: MovementView): string {
  const k = m.movement.kind;
  if (m.direction === "in") {
    if (k === "attack") return `Attack from ${m.fromName}`;
    if (k === "raid") return `Raid from ${m.fromName}`;
    if (k === "scout") return `Scouts from ${m.fromName}`;
    if (k === "reinforce") return `Reinforcements from ${m.fromName}`;
    if (k === "trade") return `Merchants from ${m.fromName}`;
    return `From ${m.fromName}`;
  }
  if (k === "return") return `Back from ${m.fromName}`;
  if (k === "tradeReturn") return `Merchants back from ${m.fromName}`;
  const verb: Record<string, string> = { attack: "Attack on", raid: "Raid on", scout: "Scouting", reinforce: "Reinforcing", settle: "Settling", trade: "Goods to" };
  return `${verb[k] ?? k} ${m.toName}`;
}

export function Marches() {
  const s = useSession();
  const nav = useNav();
  const now = s.now();
  const moves = movementsFor(s.state, content, s.active);
  if (moves.length === 0) return null;
  return (
    <section className="hud-card marches" aria-label="Marches">
      <div className="eyebrow">Marches</div>
      <ul className="marches__list">
        {moves.slice(0, 8).map((m) => (
          <li key={m.movement.id} className={`march march--${m.direction}${m.hostile ? " is-hostile" : ""}`}>
            <button className="march__link" onClick={() => nav.showOnMap(m.movement.toTile)}>
              <span className="march__arrow" aria-hidden>
                {m.direction === "in" ? "⇠" : m.direction === "home" ? "↩" : "⇢"}
              </span>
              <span className="march__text">{movementLabel(m)}</span>
            </button>
            <Countdown to={m.movement.arriveAt} now={now} />
          </li>
        ))}
      </ul>
      {moves.length > 8 && (
        <button className="link small" onClick={() => nav.open({ kind: "troops" })}>
          {moves.length - 8} more
        </button>
      )}
    </section>
  );
}

// --- bottom: the builders --------------------------------------------------------------------------

export function BuilderSlots() {
  const s = useSession();
  const nav = useNav();
  const now = s.now();
  const v = s.state.villages[s.villageId]!;
  const faction = content.factions[s.player.factionId]!;
  const size = (faction.buildQueues ?? content.world.buildQueues).reduce((n, q) => n + q.size, 0);
  const jobs = [...v.buildQueue].sort((a, b) => a.startAt - b.startAt);
  const name = (kind: string, id: string) => (kind === "field" ? content.fields[id]?.name : content.buildings[id]?.name) ?? id;
  const thumb = (kind: string, id: string) => (kind === "field" ? (id === "timber" ? art("b-sawmill") : null) : art(`b-${id}`));
  return (
    <section className="builders" aria-label="Builders">
      {Array.from({ length: size }, (_, i) => {
        const j = jobs[i];
        if (!j) {
          return (
            <div key={i} className="builder builder--free">
              <Icon name="hammer" size={20} />
              <span className="builder__text">{i === 0 ? "Builders idle" : "Free"}</span>
            </div>
          );
        }
        const started = j.startAt <= now;
        const t = thumb(j.kind, j.buildingId);
        return (
          <div key={j.id} className={`builder${started ? " is-working" : ""}`}>
            {t ? <img className="builder__img" src={t} alt="" width={44} height={44} /> : <ResIcon id={j.buildingId} size={36} />}
            <div className="builder__body">
              <span className="builder__text">
                {name(j.kind, j.buildingId)} <span className="builder__lvl">→ {j.level}</span>
              </span>
              {started ? <Bar value={now - j.startAt} max={j.endAt - j.startAt} /> : <span className="builder__wait">waiting</span>}
              <span className="builder__time">
                <Countdown to={j.endAt} now={now} />
              </span>
            </div>
            <button className="icon-btn icon-btn--small" title="Cancel and refund" onClick={() => s.run((g, tm) => g.cancelBuild(s.active, v.id, j.id, tm), "Cancelled and refunded.")}>
              ×
            </button>
          </div>
        );
      })}
      <button className="builder builder--more" onClick={() => nav.go("town")} title="Open the town centre">
        <Icon name="plus" size={18} />
      </button>
    </section>
  );
}

// --- bottom right: quick actions -------------------------------------------------------------------

export function QuickBar() {
  const s = useSession();
  const nav = useNav();
  const v = s.state.villages[s.villageId]!;
  const slotOf = (id: string) => v.buildings.findIndex((b) => b?.id === id);
  const training = v.training.reduce((n, b) => n + b.count - b.done, 0);
  const quick: { label: string; icon: string; on: () => void; disabled?: boolean; badge?: number }[] = [
    { label: "Send troops", icon: "send", on: () => nav.open({ kind: "send" }), disabled: slotOf("muster_ground") < 0 },
    { label: "Send goods", icon: "goods", on: () => nav.open({ kind: "resources" }), disabled: slotOf("agora") < 0 },
    { label: "Barracks", icon: "barracks", on: () => nav.open({ kind: "slot", slot: slotOf("barracks") }), disabled: slotOf("barracks") < 0, badge: training },
    { label: "Gymnasion", icon: "scroll", on: () => nav.open({ kind: "slot", slot: slotOf("gymnasion") }), disabled: slotOf("gymnasion") < 0 },
  ];
  return (
    <nav className="quick" aria-label="Quick actions">
      {quick.map((q) => (
        <button key={q.label} className="quick__btn" onClick={q.on} disabled={q.disabled} title={q.disabled ? `Build the ${q.label === "Send troops" ? "Muster Ground" : q.label === "Send goods" ? "Agora" : q.label} first` : q.label}>
          <Icon name={q.icon} size={20} />
          <span className="quick__label">{q.label}</span>
          {q.badge ? <span className="rail__badge">{q.badge}</span> : null}
        </button>
      ))}
    </nav>
  );
}

// --- troops at home, under the hero on wide screens -----------------------------------------------

export function HomeTroops() {
  const s = useSession();
  const v = s.state.villages[s.villageId]!;
  if (troopCount(v.troops) === 0 && v.stationed.length === 0) return null;
  return (
    <section className="hud-card hometroops" aria-label="Troops at home">
      <div className="eyebrow">Troops in {v.name}</div>
      <ul className="hometroops__list">
        {Object.entries(v.troops).map(([u, n]) => (
          <li key={u} title={content.units[u]?.name}>
            <img src={content.units[u]?.icon ? asset(content.units[u]!.icon!) : art("lion")} alt="" width={26} height={26} />
            <span>{int(n)}</span>
          </li>
        ))}
      </ul>
      {v.stationed.length > 0 && <p className="muted small">+{v.stationed.reduce((n, g) => n + troopCount(g.troops), 0)} reinforcements</p>}
    </section>
  );
}

export function ToastHost() {
  const s = useSession();
  const t = s.toast;
  useEffect(() => {
    if (!t) return;
    const id = setTimeout(() => s.dismissToast(), t.kind === "error" ? 5000 : 2500);
    return () => clearTimeout(id);
  }, [t, s]);
  if (!t) return null;
  return (
    <div className={`toast toast--${t.kind}`} role="status" onClick={() => s.dismissToast()}>
      {t.text}
    </div>
  );
}
