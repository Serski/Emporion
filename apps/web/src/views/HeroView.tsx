import { useState } from "react";
import { heroView, type HeroPoints } from "@emporion/engine";
import { content } from "../content";
import { duration, int, pct } from "../format";
import { heroStatus } from "../chrome";
import { useNav } from "../nav";
import { Bar, Cost, Countdown, ResIcon, Stat, useSession } from "../ui";

const ATTRS: { id: keyof HeroPoints; label: string; explain: (n: number) => string }[] = [
  { id: "strength", label: "Fighting strength", explain: (n) => `${int(content.hero.strength.base + content.hero.strength.perPoint * n)} attack and defence of their own` },
  { id: "offense", label: "Offence bonus", explain: (n) => `+${pct(content.hero.offensePerPoint * n)} attack for the army they lead` },
  { id: "defense", label: "Defence bonus", explain: (n) => `+${pct(content.hero.defensePerPoint * n)} defence for the troops they stand with` },
  { id: "production", label: "Resources", explain: (n) => `${int(content.hero.production.allPerPoint * n)} of each, or ${int(content.hero.production.singlePerPoint * n)} of one, per hour at speed 1` },
];

export function HeroView() {
  const s = useSession();
  const nav = useNav();
  const now = s.now();
  const h = heroView(s.state, content, s.player, now);
  const [add, setAdd] = useState<Partial<HeroPoints>>({});
  if (!h) return <p className="empty">Heroes are off in this world.</p>;
  const home = s.state.villages[h.homeVillageId];
  const pending = Object.values(add).reduce((a, b) => a + (b ?? 0), 0);
  return (
    <div className="hero-view">
      <div className="view-head">
        <div>
          <div className="eyebrow">
            Hero of {home?.name} · {heroStatus(h.status)}
          </div>
          <h1 className="view-title">{h.name}</h1>
        </div>
        <div className="stats-row">
          <Stat label="Level">{h.level}</Stat>
          <Stat label="Experience">
            {int(h.xp)} / {int(h.xpNext)}
          </Stat>
          <Stat label="Health">{h.alive ? `${h.health}%` : "—"}</Stat>
        </div>
      </div>
      <div className="hero-bars">
        <div>
          <span className="small muted">Experience to level {h.level + 1}</span>
          <Bar value={h.xp} max={h.xpNext} />
        </div>
        <div>
          <span className="small muted">Health (+{content.hero.healthRegenPerDay}% a day)</span>
          <Bar value={h.health} max={100} tone={h.health < 30 ? "danger" : "good"} />
        </div>
      </div>
      {h.status === "dead" && (
        <section className="subpanel">
          <h3 className="subpanel__title">Your hero has fallen</h3>
          <p>
            Revive in {home?.name} in {duration(h.reviveMs)}.
          </p>
          <Cost cost={h.reviveCost} have={home?.resources} />
          <button className="btn btn--primary" onClick={() => s.run((g, t) => g.reviveHero(s.active, t), "The hero is being revived.")}>
            Revive
          </button>
        </section>
      )}
      {h.status === "reviving" && h.reviveAt !== null && (
        <p className="note">
          Back on their feet in <Countdown to={h.reviveAt} now={now} />.
        </p>
      )}
      <section className="subpanel">
        <div className="subpanel__head">
          <h3 className="subpanel__title">Attributes</h3>
          <span className="tag">{h.unspent - pending} points to spend</span>
        </div>
        <ul className="attrs">
          {ATTRS.map((a) => {
            const extra = add[a.id] ?? 0;
            return (
              <li key={a.id} className="attr">
                <div>
                  <div className="attr__name">
                    {a.label} <span className="attr__pts">{h.points[a.id] + extra}</span>
                  </div>
                  <div className="small muted">{a.explain(h.points[a.id] + extra)}</div>
                </div>
                <div className="attr__btns">
                  <button className="icon-btn" disabled={extra <= 0} onClick={() => setAdd((x) => ({ ...x, [a.id]: extra - 1 }))} aria-label={`One point less in ${a.label}`}>
                    −
                  </button>
                  <button className="icon-btn" disabled={h.unspent - pending <= 0} onClick={() => setAdd((x) => ({ ...x, [a.id]: extra + 1 }))} aria-label={`One point more in ${a.label}`}>
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <button
          className="btn btn--primary"
          disabled={pending === 0}
          onClick={() => {
            const r = s.run((g, t) => g.assignHeroPoints(s.active, add, t), "Points assigned.");
            if (r.ok) setAdd({});
          }}
        >
          Confirm points
        </button>
      </section>
      <section className="subpanel">
        <h3 className="subpanel__title">Production</h3>
        <p className="small muted">The hero's resource points produce for {home?.name} whenever they are alive.</p>
        <div className="segmented">
          <button className={`segmented__btn${h.productionResource === "all" ? " is-on" : ""}`} onClick={() => s.run((g, t) => g.setHeroProduction(s.active, "all", t))}>
            All four
          </button>
          {content.resourceIds.map((r) => (
            <button key={r} className={`segmented__btn${h.productionResource === r ? " is-on" : ""}`} onClick={() => s.run((g, t) => g.setHeroProduction(s.active, r, t))}>
              <ResIcon id={r} size={16} /> {content.resources.find((x) => x.id === r)?.name}
            </button>
          ))}
        </div>
      </section>
      <section className="subpanel">
        <h3 className="subpanel__title">In the field</h3>
        <ul className="bullets">
          <li>Tick "Hero goes with them" when sending troops. Alone, the hero marches at speed {content.hero.speed}.</li>
          <li>Each fallen enemy is worth its wheat upkeep in experience; every level brings {content.hero.pointsPerLevel} points.</li>
          <li>Win an attack on an oasis within {content.hero.oasisRadius} fields of home with the hero in the army to annex it (needs a Heroon).</li>
          <li>Send the hero to another of your towns as reinforcement, then make it their new home from there.</li>
        </ul>
        {h.status === "stationed" && s.player.hero?.where?.startsWith("v:") && (
          <button className="btn" onClick={() => s.run((g, t) => g.moveHeroHome(s.active, s.player.hero!.where!.slice(2), t), "New home town.")}>
            Make {s.state.villages[s.player.hero!.where!.slice(2)]?.name} the hero's home
          </button>
        )}
        <button className="btn btn--ghost" onClick={() => nav.go("map")}>
          Find oases on the map
        </button>
      </section>
    </div>
  );
}
