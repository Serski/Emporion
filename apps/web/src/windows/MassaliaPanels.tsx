import { craftOptions, houseView } from "@emporion/engine";
import { content } from "../content";
import { duration, pct } from "../format";
import { useNav } from "../nav";
import { Bar, Countdown, GoodIcon, goodLabel, useSession } from "../ui";

// The Barracks' altar (MASSALIA's): one beast burned blesses every man the
// house fields.
export function AltarPanel() {
  const s = useSession();
  const now = s.now();
  const v = s.state.villages[s.villageId]!;
  const house = houseView(s.state, content, s.player, now);
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
      <div className="offerings">
        {house.offerings.map((o) => (
          <div key={o.good} className="offering">
            <GoodIcon id={o.good} size={44} />
            <div>
              <div className="offering__name">{o.name}</div>
              <div className="small muted">+{pct(o.boost)} to every man · {duration(house.altarDurationMs)}</div>
            </div>
            <button className="btn btn--buy btn--small" disabled={!!house.altar || o.have < 1} onClick={() => s.run((g, t) => g.sacrifice(s.active, v.id, o.good, t), "The altar is lit.")}>
              {o.have > 0 ? `Sacrifice · you have ${o.have}` : "Sacrifice · none in stock"}
            </button>
          </div>
        ))}
      </div>
      <p className="muted small">
        Devotion makes the blessing stronger; a priest keeps the fire burning {pct((content.people["priest"]?.altarDuration ?? 1) - 1)} longer. The agora sells{" "}
        {content.massalia.crafting.altar.offerings.map((o) => (content.goods[o.good]?.name ?? o.good).toLowerCase()).join(" and ")}.
      </p>
    </section>
  );
}

// The Harbor's slips: naval supplies and MASSALIA's two hulls.
export function ShipyardPanel({ buildingId }: { buildingId: string }) {
  const s = useSession();
  const now = s.now();
  const v = s.state.villages[s.villageId]!;
  const house = houseView(s.state, content, s.player, now);
  const options = craftOptions(s.state, content, s.player, v.id, buildingId);
  const jobs = house.crafts.filter((j) => j.villageName === v.name && content.recipes[j.recipeId]?.building === buildingId);
  const slots = options[0]?.slots ?? 0;
  return (
    <section className="subpanel">
      <div className="subpanel__head">
        <h3 className="subpanel__title">Shipyard</h3>
        <span className="tag">
          {jobs.length} of {slots} slips in use
        </span>
      </div>
      {jobs.map((j) => (
        <div key={j.id} className="craft-job">
          <span>On the slip: {j.name}</span>
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
                  {inputs} · {duration(r.durationMs)} on the slip · needs {people}
                  {r.level > 1 ? ` · Harbor level ${r.level}` : ""}
                </div>
                {!o.check.ok && <div className="small muted">{o.check.message}</div>}
              </div>
              <button className="btn btn--buy btn--small" disabled={!o.check.ok} onClick={() => s.run((g, t) => g.craft(s.active, o.id, v.id, t), `${r.name} is on the slip, ready in ${duration(r.durationMs)}.`)}>
                Craft
              </button>
            </li>
          );
        })}
      </ul>
      <p className="muted small">
        In port: {house.ships.map((sh) => `${sh.inPort} ${sh.name}${sh.inPort === 1 ? "" : "s"}${sh.atSea ? ` (+${sh.atSea} at sea)` : ""}`).join(" · ")}.
      </p>
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
