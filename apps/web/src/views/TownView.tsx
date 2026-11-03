import { slotViews, villageSummary } from "@emporion/engine";
import { content } from "../content";
import { useNav } from "../nav";
import { Stat, useSession } from "../ui";
import { int } from "../format";

// The town centre: the walls frame the building sites, the Muster Ground
// stands outside the gate. Each site opens its building's window.
export function TownView() {
  const s = useSession();
  const nav = useNav();
  const v = s.state.villages[s.villageId]!;
  const slots = slotViews(s.state, content, v);
  const sum = villageSummary(s.state, content, v);
  const walls = slots.find((x) => x.reservedFor?.effects.wall);
  const muster = slots.find((x) => x.reservedFor?.effects.rallyPoint);
  const inner = slots.filter((x) => !x.reservedFor);

  const tile = (slotIndex: number, extra = "") => {
    const sv = slots[slotIndex]!;
    const b = sv.building;
    const building = sv.queued > 0;
    const ready = !!sv.plan?.check.ok;
    const label = b ? b.def.name : sv.reservedFor ? sv.reservedFor.name : "Empty site";
    return (
      <button
        key={slotIndex}
        className={`site${b ? "" : " site--empty"}${building ? " is-building" : ""}${ready && b ? " is-ready" : ""} ${extra}`}
        onClick={() => nav.open({ kind: "slot", slot: slotIndex })}
      >
        <span className="site__name">{label}</span>
        {b ? (
          <span className="site__level">
            Level {b.level}
            {building && <span className="site__next"> → {sv.plan?.fromLevel}</span>}
          </span>
        ) : (
          <span className="site__level">{sv.reservedFor ? "Not built" : "Build here"}</span>
        )}
      </button>
    );
  };

  return (
    <div className="town-view">
      <div className="view-head">
        <div>
          <div className="eyebrow">
            Town centre · {v.isCapital ? "capital" : "colony"} · ({v.x}|{v.y})
          </div>
          <h1 className="view-title">{v.name}</h1>
        </div>
        <div className="stats-row">
          <Stat label="Population">{int(sum.population)}</Stat>
          <Stat label="Loyalty">{Math.floor(sum.loyalty)}%</Stat>
          <Stat label="Merchants">
            {sum.merchants.total - sum.merchants.busy}/{sum.merchants.total}
          </Stat>
          <Stat label="Expansion">
            {sum.expansion.used}/{sum.expansion.slots}
          </Stat>
        </div>
      </div>
      <div className="polis">
        <div className={`polis__walls${walls?.building ? " has-walls" : ""}`}>
          {walls && tile(walls.slot, "site--walls")}
          <div className="polis__grid">{inner.map((x) => tile(x.slot))}</div>
        </div>
        {muster && <div className="polis__gate">{tile(muster.slot, "site--muster")}</div>}
      </div>
    </div>
  );
}
