import { useEffect } from "react";
import { movementsFor, villageSummary, playerSummary, heroView, troopCount, type MovementView } from "@emporion/engine";
import { content } from "./content";
import { duration, gameDate, int, signed } from "./format";
import { useNav, type View } from "./nav";
import { Bar, Countdown, ResIcon, UnitIcon, useSession } from "./ui";

const WARPS = [1, 10, 100, 1000];

export function TopBar() {
  const s = useSession();
  const nav = useNav();
  const now = s.now();
  const v = s.state.villages[s.villageId]!;
  const sum = villageSummary(s.state, content, v);
  const me = playerSummary(s.state, content, s.player);
  return (
    <header className="topbar">
      <div className="topbar__row">
        <div className="brand">
          <span className="brand__name">Emporion</span>
          <span className="brand__world">
            {s.state.settings.name} · speed ×{s.state.settings.speed}
          </span>
        </div>
        <label className="town-select">
          <span className="visually-hidden">Town</span>
          <select id="town-select" value={v.id} onChange={(e) => s.selectVillage(e.target.value)}>
            {s.player.villageIds.map((id) => {
              const t = s.state.villages[id]!;
              return (
                <option key={id} value={id}>
                  {t.name} ({t.x}|{t.y}){t.isCapital ? " ★" : ""}
                </option>
              );
            })}
          </select>
        </label>
        <div className="clock">
          <span className="clock__date" title="Game time since the world was founded">
            {gameDate(now, s.state.settings.startedAt)}
          </span>
          <div className="clock__controls" role="group" aria-label="Game clock">
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
          <button className="chip chip--ghost" onClick={() => nav.open({ kind: "players" })} title="Players on this screen">
            {s.player.name} ▾
          </button>
        </div>
      </div>
      <div className="resbar" aria-label="Resources">
        {content.resourceIds.map((r) => {
          const amt = sum.resources[r] ?? 0;
          const cap = sum.capacity[r] ?? 0;
          const rate = sum.net[r] ?? 0;
          const full = amt >= cap - 0.5;
          return (
            <div key={r} className={`res${full ? " is-full" : ""}${rate < 0 ? " is-negative" : ""}`} title={`${content.resources.find((x) => x.id === r)?.name}: ${signed(rate)} per hour`}>
              <ResIcon id={r} size={26} />
              <div className="res__body">
                <div className="res__nums">
                  <span className="res__amt">{int(amt)}</span>
                  <span className="res__cap">/ {int(cap)}</span>
                </div>
                <Bar value={amt} max={cap} tone={full ? "warn" : "accent"} />
                <span className="res__rate">{signed(rate)}/h</span>
              </div>
            </div>
          );
        })}
        <div className="res res--meta">
          <div className="res__body">
            <span className="res__label">People</span>
            <span className="res__amt">{int(sum.population)}</span>
            <span className="res__rate">{int(sum.upkeep)} wheat/h eaten</span>
          </div>
        </div>
        <div className="res res--meta">
          <div className="res__body">
            <span className="res__label">Culture</span>
            <span className="res__amt">
              {int(me.culture)} <span className="res__cap">/ {int(me.cultureNext)}</span>
            </span>
            <span className="res__rate">+{int(me.culturePerDay)}/day</span>
          </div>
        </div>
      </div>
      {(sum.net[content.food] ?? 0) < 0 && (
        <p className="starve-note">
          {content.resources.find((r) => r.id === content.food)?.name} is running out: {(v.resources[content.food] ?? 0) < 1 ? "troops are starving now" : `the granary is empty in ${duration((((v.resources[content.food] ?? 0) / -(sum.net[content.food] ?? 1)) * 3_600_000))}, then troops starve`}. Raise wheat fields or send troops away.
        </p>
      )}
      {s.player.protectedUntil > now && (
        <p className="protect-note">Beginner's protection for {duration(s.player.protectedUntil - now)}: other players cannot attack you yet. Attacking a player ends it.</p>
      )}
    </header>
  );
}

const TAB_LABELS: Record<View, string> = {
  fields: "Fields",
  town: "Town",
  map: "Map",
  reports: "Reports",
  rankings: "Rankings",
  hero: "Hero",
  kingdom: "Kingdom",
};

export function ViewTabs() {
  const s = useSession();
  const nav = useNav();
  const unread = Object.values(s.state.reports).filter((r) => r.unread.includes(s.active)).length;
  return (
    <nav className="tabs" aria-label="Views">
      {(Object.keys(TAB_LABELS) as View[]).map((v) => (
        <button key={v} className={`tab${nav.view === v ? " is-active" : ""}`} onClick={() => nav.go(v)} aria-current={nav.view === v ? "page" : undefined}>
          {TAB_LABELS[v]}
          {v === "reports" && unread > 0 && <span className="badge">{unread}</span>}
        </button>
      ))}
    </nav>
  );
}

function movementLabel(m: MovementView): string {
  const k = m.movement.kind;
  if (m.direction === "in") {
    if (k === "attack") return `Attack from ${m.fromName}`;
    if (k === "raid") return `Raid from ${m.fromName}`;
    if (k === "scout") return `Scouts from ${m.fromName}`;
    if (k === "reinforce") return `Reinforcements from ${m.fromName}`;
    if (k === "trade") return `Merchants from ${m.fromName}`;
    return `Arriving from ${m.fromName}`;
  }
  if (k === "return") return `Returning from ${m.fromName}`;
  if (k === "tradeReturn") return `Merchants back from ${m.fromName}`;
  const verb: Record<string, string> = { attack: "Attack on", raid: "Raid on", scout: "Scouting", reinforce: "Reinforcing", settle: "Settling", trade: "Goods to" };
  return `${verb[k] ?? k} ${m.toName}`;
}

export function SideColumn() {
  const s = useSession();
  const nav = useNav();
  const now = s.now();
  const v = s.state.villages[s.villageId]!;
  const moves = movementsFor(s.state, content, s.active);
  const hero = heroView(s.state, content, s.player, now);
  const nameOf = (kind: string, id: string) => (kind === "field" ? content.fields[id]?.name : content.buildings[id]?.name) ?? id;
  return (
    <aside className="side" aria-label="Town status">
      <section className="panel">
        <h3 className="panel__title">Builders</h3>
        {v.buildQueue.length === 0 ? (
          <p className="muted">Idle. Pick a field or a building site.</p>
        ) : (
          <ul className="list">
            {[...v.buildQueue]
              .sort((a, b) => a.startAt - b.startAt)
              .map((j) => (
                <li key={j.id} className="list__row">
                  <span>
                    {nameOf(j.kind, j.buildingId)} <span className="muted">→ {j.level}</span>
                    {j.startAt > now && <span className="tag">waiting</span>}
                  </span>
                  <span className="list__end">
                    <Countdown to={j.endAt} now={now} />
                    <button className="icon-btn icon-btn--small" title="Cancel and refund" onClick={() => s.run((g, t) => g.cancelBuild(s.active, v.id, j.id, t), "Cancelled and refunded.")}>
                      ×
                    </button>
                  </span>
                </li>
              ))}
          </ul>
        )}
      </section>

      {v.training.length > 0 && (
        <section className="panel">
          <h3 className="panel__title">Training</h3>
          <ul className="list">
            {v.training.map((b) => (
              <li key={b.id} className="list__row">
                <span className="list__unit">
                  <UnitIcon id={b.unitId} size={24} /> {b.count - b.done} × {content.units[b.unitId]?.name}
                </span>
                <span className="list__end" title="Next one ready in">
                  <Countdown to={Math.max(now, b.startAt) + (b.startAt > now ? b.unitMs : b.unitMs - ((now - b.startAt) % b.unitMs))} now={now} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h3 className="panel__title">Marches</h3>
        {moves.length === 0 ? (
          <p className="muted">No troops or merchants on the road.</p>
        ) : (
          <ul className="list">
            {moves.slice(0, 12).map((m) => (
              <li key={m.movement.id} className={`list__row move move--${m.direction}${m.hostile ? " move--hostile" : ""}`}>
                <button className="link" onClick={() => nav.showOnMap(m.direction === "in" ? m.movement.toTile : m.movement.toTile)}>
                  <span className="move__arrow" aria-hidden>
                    {m.direction === "in" ? "⇠" : m.direction === "home" ? "↩" : "⇢"}
                  </span>
                  {movementLabel(m)}
                </button>
                <Countdown to={m.movement.arriveAt} now={now} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h3 className="panel__title">Troops in {v.name}</h3>
        {troopCount(v.troops) === 0 ? (
          <p className="muted">No troops at home.</p>
        ) : (
          <ul className="troops troops--compact">
            {Object.entries(v.troops).map(([u, n]) => (
              <li key={u} title={content.units[u]?.name}>
                <UnitIcon id={u} size={26} />
                <span className="troops__n">{int(n)}</span>
              </li>
            ))}
          </ul>
        )}
        {v.stationed.length > 0 && <p className="muted small">{v.stationed.reduce((n, g) => n + troopCount(g.troops), 0)} reinforcements stationed here.</p>}
        {hero && (
          <button className="hero-line" onClick={() => nav.go("hero")}>
            <span className="hero-line__name">Hero {hero.name}</span>
            <span className={`tag tag--${hero.alive ? "ok" : "bad"}`}>{heroStatus(hero.status)}</span>
            <Bar value={hero.health} max={100} tone={hero.health < 30 ? "danger" : "good"} />
          </button>
        )}
      </section>

      {s.player.villageIds.length > 1 && (
        <section className="panel">
          <h3 className="panel__title">Your towns</h3>
          <ul className="list">
            {s.player.villageIds.map((id) => {
              const t = s.state.villages[id]!;
              return (
                <li key={id} className={`list__row${id === v.id ? " is-current" : ""}`}>
                  <button className="link" onClick={() => s.selectVillage(id)}>
                    {t.name} {t.isCapital && <span className="tag">capital</span>}
                  </button>
                  <span className="muted">
                    ({t.x}|{t.y})
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </aside>
  );
}

export function heroStatus(status: string): string {
  return { home: "at home", moving: "on the march", stationed: "stationed away", dead: "fallen", reviving: "reviving" }[status] ?? status;
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
