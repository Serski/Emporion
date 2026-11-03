import { festivalOptions, playerSummary, villageSummary } from "@emporion/engine";
import { content } from "../content";
import { int, pct } from "../format";
import { useNav } from "../nav";
import { Cost, Countdown, useSession } from "../ui";

export function MarketPanel() {
  const s = useSession();
  const nav = useNav();
  const v = s.state.villages[s.villageId]!;
  const sum = villageSummary(s.state, content, v);
  return (
    <section className="subpanel">
      <div className="subpanel__head">
        <h3 className="subpanel__title">Merchants</h3>
        <button className="btn btn--primary" disabled={sum.merchants.total - sum.merchants.busy <= 0} onClick={() => nav.open({ kind: "resources" })}>
          Send goods
        </button>
      </div>
      <p>
        {sum.merchants.total - sum.merchants.busy} of {sum.merchants.total} merchants free, each carrying {int(sum.merchants.capacity)}.
      </p>
    </section>
  );
}

export function FestivalPanel() {
  const s = useSession();
  const v = s.state.villages[s.villageId]!;
  const now = s.now();
  const opts = festivalOptions(s.state, content, v);
  return (
    <section className="subpanel">
      <h3 className="subpanel__title">Festivals</h3>
      {v.festival && (
        <p className="note">
          {opts.find((o) => o.festival.id === v.festival!.festivalId)?.festival.name} under way: {int(v.festival.culture)} culture points in <Countdown to={v.festival.endAt} now={now} />
        </p>
      )}
      <ul className="unit-list">
        {opts.map((o) => (
          <li key={o.festival.id} className="unit-row unit-row--compact">
            <div className="unit-row__info">
              <div className="unit-row__name">
                {o.festival.name} <span className="tag">+{int(o.festival.culture)} culture</span>
              </div>
              <Cost cost={o.festival.cost} have={v.resources} time={o.durationMs} />
              {!o.check.ok && <p className="note note--warn">{o.check.message}</p>}
            </div>
            <div className="unit-row__act">
              <button className="btn btn--primary" disabled={!o.check.ok} onClick={() => s.run((g, t) => g.holdFestival(s.active, v.id, o.festival.id, t), `${o.festival.name} begins.`)}>
                Hold
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ExpansionPanel() {
  const s = useSession();
  const v = s.state.villages[s.villageId]!;
  const sum = villageSummary(s.state, content, v);
  const me = playerSummary(s.state, content, s.player);
  return (
    <section className="subpanel">
      <h3 className="subpanel__title">Expansion</h3>
      <ul className="bullets">
        <li>
          Expansion slots used: {sum.expansion.used} of {sum.expansion.slots}. Each slot founds or takes one town and allows {content.world.expansion.settlersPerSlot} settlers or {content.world.expansion.chiefsPerSlot} envoy.
        </li>
        <li>
          Culture points: {int(me.culture)} of the {int(me.cultureNext)} needed for town number {s.player.villageIds.length + 1} (+{int(me.culturePerDay)} a day).
        </li>
        <li>
          Founding a town costs <Cost cost={content.world.expansion.foundingCost} have={v.resources} /> carried by {content.world.expansion.settlersNeeded} settlers. Send them from the Muster Ground or a valley on the map.
        </li>
        <li>Loyalty: {Math.floor(v.loyalty)}%. Enemy envoys cannot lower it while this building stands.</li>
      </ul>
      {v.children.length > 0 && (
        <p className="small">
          Towns founded or taken from here: {v.children.map((id) => s.state.villages[id]?.name ?? "lost").join(", ")}
        </p>
      )}
    </section>
  );
}

export function HeroonPanel() {
  const s = useSession();
  const nav = useNav();
  const v = s.state.villages[s.villageId]!;
  const sum = villageSummary(s.state, content, v);
  return (
    <section className="subpanel">
      <div className="subpanel__head">
        <h3 className="subpanel__title">Oases</h3>
        <button className="btn" onClick={() => nav.go("hero")}>
          Hero
        </button>
      </div>
      <p>
        Oasis slots used: {sum.oases.used} of {sum.oases.slots}. Win an attack on an oasis within {content.hero.oasisRadius} fields with your hero in the army to annex it.
      </p>
      {v.oases.length > 0 && (
        <ul className="bullets">
          {v.oases.map((tile) => {
            const o = s.state.oases[tile];
            const type = o ? content.oasisTypes[o.typeId] : undefined;
            return (
              <li key={tile}>
                <button className="link" onClick={() => nav.showOnMap(tile)}>
                  {type?.name}
                </button>{" "}
                ·{" "}
                {Object.entries(type?.bonus ?? {})
                  .map(([r, b]) => `+${pct(b)} ${content.resources.find((x) => x.id === r)?.name}`)
                  .join(", ")}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function TreasuryPanel() {
  const s = useSession();
  const nav = useNav();
  const v = s.state.villages[s.villageId]!;
  const sum = villageSummary(s.state, content, v);
  return (
    <section className="subpanel">
      <div className="subpanel__head">
        <h3 className="subpanel__title">Treasures</h3>
        <button className="btn" onClick={() => nav.go("kingdom")}>
          Kingdom
        </button>
      </div>
      <p>
        {int(sum.treasures.stored)} treasures stored, {int(sum.treasures.counted)} of them held safe (room for {int(sum.treasures.capacity)}). Raids that beat outlaw camps and free cities carry their treasures home. Held treasures widen a king's influence and earn victory points.
      </p>
    </section>
  );
}
