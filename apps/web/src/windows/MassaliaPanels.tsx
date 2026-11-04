import { craftOptions, holdingYield, houseView, seasonOfYear } from "@emporion/engine";
import { content } from "../content";
import { duration, pct } from "../format";
import { useNav } from "../nav";
import { Bar, Countdown, GoodIcon, goodCount, goodLabel, useSession } from "../ui";

// The altar in the Sanctuary (MASSALIA's): one beast burned blesses every man
// the house fields. It takes no offering unless the house retains a priest.
export function AltarPanel() {
  const s = useSession();
  const nav = useNav();
  const now = s.now();
  const v = s.state.villages[s.villageId]!;
  const house = houseView(s.state, content, s.player, now);
  const priest = house.altarNeeds;
  return (
    <section className="subpanel">
      <h3 className="subpanel__title">Altar</h3>
      {house.altar ? (
        <p className="note note--done">
          The altar smokes · +{pct(house.altar.boost)} to every man you field · <Countdown to={house.altar.until} now={now} />
        </p>
      ) : (
        <p className="small muted">A beast burned here steadies every man you field for {duration(house.altarDurationMs)}. One offering at a time.</p>
      )}
      {priest.have ? (
        <p className="small">Your {priest.name.toLowerCase()} serves the altar.</p>
      ) : (
        <p className="note note--warn small">
          The altar takes no offering without a {priest.name.toLowerCase()}.{" "}
          <button className="link small" onClick={() => nav.open({ kind: "market", tab: "people" })}>
            Hire one at the Agora
          </button>
        </p>
      )}
      <div className="offerings">
        {house.offerings.map((o) => (
          <div key={o.good} className="offering">
            <GoodIcon id={o.good} size={44} />
            <div>
              <div className="offering__name">{o.name}</div>
              <div className="small muted">+{pct(o.boost)} to every man · {duration(house.altarDurationMs)}</div>
            </div>
            <button className="btn btn--buy btn--small" disabled={!!house.altar || o.have < 1 || !priest.have} onClick={() => s.run((g, t) => g.sacrifice(s.active, v.id, o.good, t), "The altar is lit.")}>
              {o.have > 0 ? `Sacrifice · you have ${o.have}` : "Sacrifice · none in stock"}
            </button>
          </div>
        ))}
      </div>
      <p className="muted small">Devotion makes the blessing stronger. Bulls and chickens come from the agora, a Bull Farm or a Poultry Yard.</p>
    </section>
  );
}

const CRAFT_TITLE: Record<string, { title: string; place: string; places: string }> = {
  shipyard: { title: "On the slips", place: "slip", places: "slips" },
  salon: { title: "The hetaira's cabinet", place: "place", places: "places" },
};

// The crafts a building works: hulls and naval supplies on the Shipyard's
// slips, remedies and poisons in the Salon.
export function CraftPanel({ buildingId }: { buildingId: string }) {
  const s = useSession();
  const now = s.now();
  const v = s.state.villages[s.villageId]!;
  const house = houseView(s.state, content, s.player, now);
  const options = craftOptions(s.state, content, s.player, v.id, buildingId);
  const jobs = house.crafts.filter((j) => j.villageName === v.name && content.recipes[j.recipeId]?.building === buildingId);
  const words = CRAFT_TITLE[buildingId] ?? { title: "Crafts", place: "place", places: "places" };
  const slots = options[0]?.slots ?? 0;
  const bname = content.buildings[buildingId]?.name ?? buildingId;
  return (
    <section className="subpanel">
      <div className="subpanel__head">
        <h3 className="subpanel__title">{words.title}</h3>
        <span className="tag">
          {jobs.length} of {slots} {slots === 1 ? words.place : words.places} in use
        </span>
      </div>
      {jobs.map((j) => (
        <div key={j.id} className="craft-job">
          <span>{j.name}</span>
          <Bar value={now - j.startAt} max={j.readyAt - j.startAt} />
          <Countdown to={j.readyAt} now={now} />
        </div>
      ))}
      <ul className="recipe-list">
        {options.map((o) => {
          const r = house.recipes.find((x) => x.id === o.id)!;
          const inputs = [
            ...Object.entries(r.goods).map(([g, n]) => `${n} ${goodLabel(g)}`),
            ...Object.entries(r.resources).map(([res, n]) => `${n} ${goodLabel(res)}`),
          ].join(" · ");
          const people = Object.entries(r.people)
            .map(([who, n]) => `${n} ${n === 1 ? content.people[who]?.name : content.people[who]?.plural}`)
            .join(", ");
          return (
            <li key={o.id} className="recipe">
              <GoodIcon id={o.id} size={40} />
              <div className="recipe__text">
                <div className="recipe__name">{r.name}</div>
                <div className="small muted">
                  {inputs} · {duration(r.durationMs)} · needs {people}
                  {r.level > 1 ? ` · ${bname} level ${r.level}` : ""}
                </div>
                {!o.check.ok && <div className="small muted">{o.check.message}</div>}
              </div>
              <button className="btn btn--buy btn--small" disabled={!o.check.ok} onClick={() => s.run((g, t) => g.craft(s.active, o.id, v.id, t), `${r.name} is under way, ready in ${duration(r.durationMs)}.`)}>
                Craft
              </button>
            </li>
          );
        })}
      </ul>
      {buildingId === "shipyard" && (
        <p className="muted small">
          In port: {house.ships.map((sh) => `${sh.inPort} ${sh.name}${sh.inPort === 1 ? "" : "s"}${sh.atSea ? ` (+${sh.atSea} at sea)` : ""}`).join(" · ")}.
        </p>
      )}
    </section>
  );
}

const SEASON_WORD = ["this winter", "this spring", "this summer", "this autumn"];

// A holding: what it yields each season now and at the next level, and who
// must work it.
export function HoldingPanel({ buildingId, level }: { buildingId: string; level: number }) {
  const s = useSession();
  const nav = useNav();
  const now = s.now();
  const def = content.buildings[buildingId]!;
  const goods = def.effects.goods!;
  const house = houseView(s.state, content, s.player, now);
  const season = seasonOfYear(s.state, content, now);
  const here = house.holdings.find((h) => h.buildingId === buildingId && h.villageId === s.villageId);
  const rate = (lvl: number) => holdingYield(content, def, lvl, season);
  const line = (y: Record<string, number>) =>
    Object.entries(y)
      .map(([g, n]) => goodCount(g, n))
      .join(" · ");
  const staff = Object.entries(goods.staff)
    .map(([who, n]) => `${n} ${n === 1 ? content.people[who]?.name.toLowerCase() : content.people[who]?.plural.toLowerCase()}`)
    .join(" and ");
  return (
    <section className="subpanel">
      <h3 className="subpanel__title">Holding</h3>
      <div className="holding">
        {Object.keys(goods.yields).map((g) => (
          <GoodIcon key={g} id={g} size={40} />
        ))}
        <div className="holding__text">
          <div>
            Each season: <strong>{line(rate(Math.max(1, level)))}</strong> {SEASON_WORD[season] ? `(${SEASON_WORD[season]})` : ""}
          </div>
          {level < def.maxLevel && <div className="small muted">At level {level + 1}: {line(rate(level + 1))}</div>}
        </div>
      </div>
      {staff &&
        (here?.staffed ? (
          <p className="small">Worked by {staff} of your house.</p>
        ) : (
          <p className="note note--warn small">
            {level > 0 ? "Idle: " : ""}it needs {staff} to work it.{" "}
            <button className="link small" onClick={() => nav.open({ kind: "market", tab: "people" })}>
              Hire at the Agora
            </button>
          </p>
        ))}
      <p className="muted small">The goods go to your house's stores at the turn of each season. Farm goods yield most in summer and least in winter.</p>
    </section>
  );
}

// The Harbor is the town's port: armies cross open sea only from here.
export function PortPanel() {
  const s = useSession();
  const house = houseView(s.state, content, s.player, s.now());
  return (
    <section className="subpanel">
      <h3 className="subpanel__title">Port</h3>
      <p className="small">Armies sail over open sea from this town, in your hulls, burning a naval supply per hull. The Shipyard builds them once the Harbor stands at level 3.</p>
      <p className="muted small">In port: {house.ships.map((sh) => `${sh.inPort} ${sh.name}${sh.inPort === 1 ? "" : "s"}`).join(" · ")}.</p>
    </section>
  );
}

export function AgoraPanel() {
  const nav = useNav();
  return (
    <section className="subpanel">
      <div className="subpanel__head">
        <h3 className="subpanel__title">The market</h3>
      </div>
      <p className="small">Buy and sell MASSALIA's goods at the agora's seasonal prices, hire people for your house, or keep a stall for other houses.</p>
      <div className="actions">
        <button className="btn btn--buy" onClick={() => nav.open({ kind: "market", tab: "goods" })}>
          Goods
        </button>
        <button className="btn" onClick={() => nav.open({ kind: "market", tab: "people" })}>
          People
        </button>
        <button className="btn" onClick={() => nav.open({ kind: "market", tab: "stalls" })}>
          Player market
        </button>
      </div>
    </section>
  );
}
