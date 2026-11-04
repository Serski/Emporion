import { craftOptions, familyView, heroView, houseView, type RoutineOption } from "@emporion/engine";
import { content } from "../content";
import { duration, int, pct } from "../format";
import { Icon } from "../icons";
import { useNav } from "../nav";
import { Bar, Countdown, GoodIcon, Portrait, art, factionName, goodLabel, useSession } from "../ui";

const STAT_NAME: Record<string, string> = Object.fromEntries(content.massalia.profile.stats.map((s) => [s.id, s.name]));

function effectChips(effects: Record<string, number>, xp: number, ladder: string | null) {
  const out: { text: string; tone: "good" | "bad" | "plain" }[] = [];
  for (const [k, v] of Object.entries(effects)) {
    if (v === 0) continue;
    const sign = v > 0 ? "+" : "−";
    const n = Math.abs(v);
    if (k === "drachmae") out.push({ text: `${sign}${n} dr`, tone: v > 0 ? "good" : "bad" });
    else if (k === "composure") out.push({ text: `${sign}${n} composure`, tone: v > 0 ? "good" : "bad" });
    else out.push({ text: `${sign}${n} ${STAT_NAME[k] ?? k}`, tone: v > 0 ? "good" : "bad" });
  }
  if (ladder && xp > 0) out.push({ text: `${xp} xp ${content.ladders[ladder]?.name ?? ladder}`, tone: "plain" });
  return out;
}

// --- the character sheet ------------------------------------------------------------

export function ProfileTab() {
  const s = useSession();
  const now = s.now();
  const h = heroView(s.state, content, s.player, now);
  const fam = familyView(s.state, content, s.player, now);
  const house = houseView(s.state, content, s.player, now);
  const poisoned = house.traits.some((t) => t.id === "poisoned");
  const hasPhysician = (s.player.people.physician ?? 0) > 0;
  return (
    <>
      <div className="sheet-head">
        <Portrait stem={h?.portrait ?? null} size={120} />
        <div className="sheet-head__text">
          <div className="eyebrow">
            {fam?.name ?? "House"} · {factionName(s.player.factionId)}
          </div>
          <h3 className="sheet-head__name">{h?.name ?? s.player.name}</h3>
          <div className="muted">{h?.age !== null && h?.age !== undefined ? `Age ${h.age} · ${h.lifeStage}` : ""}</div>
          <div className="composure">
            <span className="field__label">Composure</span>
            <Bar value={house.composure} max={100} tone={house.composure <= 20 ? "danger" : house.composure <= 50 ? "warn" : "good"} />
            <span className="composure__n">{house.composure} / 100</span>
          </div>
          {house.withdrawn && <p className="note note--warn small">Withdrawn from public life until next season.</p>}
        </div>
      </div>
      {poisoned && (
        <div className="note note--warn banner-row">
          <span>
            <strong>Poisoned.</strong> {h?.name} is ill: −3 militia, −2 intelligence, −1 prestige, and the hero fights a fifth weaker.
          </span>
          <button className="btn btn--sell btn--small" disabled={!hasPhysician} title={hasPhysician ? undefined : "Hire a physician at the Agora"} onClick={() => s.run((g, t) => g.cure(s.active, t), `${h?.name} is cured.`)}>
            Seek treatment · 1 remedy
          </button>
        </div>
      )}
      <section className="subpanel">
        <h3 className="subpanel__title">Stats · capped at 100</h3>
        <div className="stat-tiles">
          {house.stats.map((st) => (
            <div key={st.id} className="stat-tile" title={st.about}>
              <img className="stat-tile__icon" src={art(st.icon)} alt="" width={44} height={44} />
              <div className="stat-tile__value">
                {st.value}
                <small>/100</small>
              </div>
              <div className="stat-tile__name">{st.name}</div>
              <div className="small muted">
                base {st.base}
                {st.traitDelta !== 0 ? ` · traits ${st.traitDelta > 0 ? "+" : "−"}${Math.abs(st.traitDelta)}` : ""}
              </div>
              <p className="small stat-tile__about">{st.about}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="subpanel">
        <h3 className="subpanel__title">Traits · {house.traits.length}</h3>
        {house.traits.length === 0 ? (
          <p className="muted small">None yet. Each ladder's training earns one: spend your days to climb them.</p>
        ) : (
          <ul className="trait-list">
            {house.traits.map((t) => (
              <li key={t.id} className={`trait trait--${t.kind}`}>
                <span className="trait__name">{t.name}</span>
                <span className="small muted">{t.description}</span>
                <span className="trait__mods">
                  {Object.entries(t.stats).map(([k, v]) => (
                    <span key={k} className={`tchip${v < 0 ? " tchip--bad" : ""}`}>
                      {v > 0 ? "+" : "−"}
                      {Math.abs(v)} {STAT_NAME[k] ?? k}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="subpanel">
        <h3 className="subpanel__title">Ladders</h3>
        <ul className="ladders">
          {house.ladders.map((l) => (
            <li key={l.id} className="ladder">
              <span className="ladder__name">
                {l.name} <span className="muted small">→ {STAT_NAME[l.stat]}</span>
              </span>
              <Bar value={l.xp} max={l.next ?? Math.max(l.xp, 1)} />
              <span className="small muted">
                {l.next !== null ? `${l.xp}/${l.next} xp` : `${l.xp} xp · top tier`}
                {l.tier ? ` · ${l.tier}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

// --- your day ---------------------------------------------------------------------

export function DayTab() {
  const s = useSession();
  const now = s.now();
  const house = houseView(s.state, content, s.player, now);
  const day = house.day;
  if (!day) return <p className="empty">This house keeps no days.</p>;
  const spent = day.picked >= day.picksPerSeason;
  const last = day.lastRoutine ? content.routines[day.lastRoutine]?.name : null;
  return (
    <>
      <p className="lede">
        Each season the head of the house spends one day as he chooses. What he does shapes his stats, his purse and his composure. Doing the same thing two seasons running gives half as much.
      </p>
      <p className={`note${spent ? " note--done" : ""}`}>
        {day.withdrawn
          ? "Withdrawn from public life. A new day comes with the next season."
          : spent
            ? `${last ? `This season you chose ${last}. ` : ""}A new day comes with the next season, in `
            : `${house.season.name}: your day is still yours to spend. The season turns in `}
        {!day.withdrawn && <Countdown to={house.season.nextAt} now={now} />}.
      </p>
      <ul className="routine-list">
        {day.options.map((o) => (
          <RoutineCard key={o.id} o={o} />
        ))}
      </ul>
    </>
  );
}

function RoutineCard({ o }: { o: RoutineOption }) {
  const s = useSession();
  const chips = effectChips(o.effects, o.xp, o.ladder);
  return (
    <li className={`routine${o.check.ok ? "" : " is-locked"}`}>
      <div className="routine__text">
        <div className="routine__name">
          {o.name}
          {o.pool !== "citizen" && <span className="tag">salon</span>}
        </div>
        <div className="routine__chips">
          {chips.map((c, i) => (
            <span key={i} className={`chip-effect chip-effect--${c.tone}`}>
              {c.text}
            </span>
          ))}
        </div>
        <div className="small muted">
          {o.fee > 0 && `Fee ${o.fee} dr. `}
          {o.needs && `${o.needs.keep ? "Needs" : "Uses"} ${o.needs.qty} ${goodLabel(o.needs.good).toLowerCase()}. `}
          {o.waived && "Free here: your capital has what it needs. "}
          {o.boostedBy && `Your ${content.people[o.boostedBy]?.name.toLowerCase()} makes it count more. `}
          {o.repeat && "Same as last season: halved."}
        </div>
      </div>
      <button className="btn btn--buy btn--small" disabled={!o.check.ok} title={o.check.ok ? undefined : o.check.message} onClick={() => s.run((g, t) => g.doRoutine(s.active, o.id, t), `${o.name}: done.`)}>
        Spend the day
      </button>
      {!o.check.ok && <p className="small muted routine__why">{o.check.message}</p>}
    </li>
  );
}

// --- the household -------------------------------------------------------------------

export function HouseholdTab() {
  const s = useSession();
  const nav = useNav();
  const now = s.now();
  const house = houseView(s.state, content, s.player, now);
  const retained = house.people.filter((p) => p.have > 0);
  const household = craftOptions(s.state, content, s.player, null, null);
  const benchJobs = house.crafts.filter((c) => !content.recipes[c.recipeId]?.building);
  return (
    <>
      <div className="purse-line">
        <span className="purse">
          <Icon name="coin" size={18} />
          <strong>{int(house.purse)}</strong> drachmae
        </span>
        <span className="muted small">
          Upkeep {house.upkeepPerSeason} dr a season · the season turns in <Countdown to={house.season.nextAt} now={now} />
        </span>
      </div>
      <section className="subpanel">
        <div className="subpanel__head">
          <h3 className="subpanel__title">People of the house</h3>
          <button className="btn btn--small" onClick={() => nav.open({ kind: "market", tab: "people" })}>
            Hire at the Agora
          </button>
        </div>
        {retained.length === 0 ? (
          <p className="muted small">You keep no one yet. Slaves work the fields, freemen build ships, a physician guards against poison, a priest keeps the altar.</p>
        ) : (
          <ul className="troops">
            {retained.map((p) => (
              <li key={p.id} title={p.about}>
                {p.portrait ? <Portrait stem={`${p.portrait}-prime`} size={30} /> : <GoodIconPerson icon={p.icon} />}
                <span className="troops__n">{p.have}</span>
                <span className="troops__name">{p.have === 1 ? p.name : p.plural}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="subpanel">
        <h3 className="subpanel__title">The physician's bench</h3>
        {benchJobs.map((j) => (
          <div key={j.id} className="craft-job">
            <span>{j.name}</span>
            <Bar value={now - j.startAt} max={j.readyAt - j.startAt} />
            <Countdown to={j.readyAt} now={now} />
          </div>
        ))}
        <ul className="recipe-list">
          {household.map((o) => {
            const r = house.recipes.find((x) => x.id === o.id)!;
            return (
              <li key={o.id} className="recipe">
                <GoodIcon id={o.id} size={36} />
                <div className="recipe__text">
                  <div className="recipe__name">{r.name}</div>
                  <div className="small muted">
                    {Object.entries(r.goods)
                      .map(([g, n]) => `${n} ${goodLabel(g)}`)
                      .join(" · ")}{" "}
                    · {duration(r.durationMs)} · needs a physician
                  </div>
                  {!o.check.ok && <div className="small muted">{o.check.message}</div>}
                </div>
                <button className="btn btn--buy btn--small" disabled={!o.check.ok} onClick={() => s.run((g, t) => g.craft(s.active, o.id, null, t), `${r.name} is being mixed.`)}>
                  Craft
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="subpanel">
        <h3 className="subpanel__title">The altar</h3>
        {house.altar ? (
          <p className="small">
            The altar smokes · +{pct(house.altar.boost)} to every man you field · <Countdown to={house.altar.until} now={now} />
          </p>
        ) : (
          <p className="small muted">Cold. Burn a bull or a chicken at a Barracks to steady every man you field for {duration(house.altarDurationMs)}.</p>
        )}
      </section>
      <section className="subpanel">
        <h3 className="subpanel__title">The fleet</h3>
        <ul className="troops">
          {house.ships.map((sh) => (
            <li key={sh.id} title={`${sh.role === "transport" ? `carries ${sh.troopSpace}` : `escort, naval ${sh.naval}`} · range ${sh.range}`}>
              <GoodIcon id={sh.id} size={30} />
              <span className="troops__n">{sh.inPort}</span>
              <span className="troops__name">
                {sh.name}s in port{sh.atSea > 0 ? ` · ${sh.atSea} at sea` : ""}
              </span>
            </li>
          ))}
        </ul>
        <p className="muted small">A march over open sea needs hulls for every man and a naval supply per hull. Pentekonters carry 20; Triremes carry 4 and drive off fleets.</p>
      </section>
    </>
  );
}

function GoodIconPerson({ icon }: { icon: string | null }) {
  return icon ? <img className="unit-icon" src={`assets/${encodeURI(icon)}`} alt="" width={30} height={30} /> : <span className="unit-icon unit-icon--drawn" />;
}
