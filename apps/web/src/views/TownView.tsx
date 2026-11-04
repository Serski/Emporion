import { slotViews } from "@emporion/engine";
import { content } from "../content";
import { useNav } from "../nav";
import { art, useSession } from "../ui";

// The town centre: twenty building sites inside the walls, each showing its
// building in MASSALIA's painted manner with a level badge. As in Travian
// Kingdoms the walls are the ring around the sites (click the ring to build
// or raise them) and the Muster Ground stands at the gate.
export function TownView() {
  const s = useSession();
  const nav = useNav();
  const v = s.state.villages[s.villageId]!;
  const slots = slotViews(s.state, content, v);
  const walls = slots.find((x) => x.reservedFor?.effects.wall);
  const muster = slots.find((x) => x.reservedFor?.effects.rallyPoint);
  const inner = slots.filter((x) => !x.reservedFor);

  const site = (slotIndex: number, extra = "") => {
    const sv = slots[slotIndex]!;
    const b = sv.building;
    const building = sv.queued > 0;
    const ready = !!sv.plan?.check.ok;
    const def = b?.def ?? sv.reservedFor;
    return (
      <button
        key={slotIndex}
        className={`site${b ? "" : " site--empty"}${building ? " is-building" : ""}${ready && b ? " is-ready" : ""} ${extra}`}
        onClick={() => nav.open({ kind: "slot", slot: slotIndex })}
        title={b ? `${b.def.name}, level ${b.level}` : def ? `${def.name}: not built yet` : "Empty building site"}
      >
        {b ? <img className="site__art" src={art(`b-${b.def.id}`)} alt="" loading="lazy" /> : <span className="site__plus" aria-hidden>+</span>}
        <span className="site__name">{b ? b.def.name : def ? def.name : "Building site"}</span>
        {b && (
          <span className="site__badge">
            {b.level}
            {building && <span className="site__next">→{sv.plan?.fromLevel}</span>}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="town-view">
      <div className="polis">
        <div className={`polis__ring${walls?.building ? " has-walls" : ""}`}>
          {walls && site(walls.slot, "site--walls")}
          <div className="polis__grid">{inner.map((x) => site(x.slot))}</div>
          {muster && <div className="polis__gate">{site(muster.slot, "site--muster")}</div>}
        </div>
      </div>
    </div>
  );
}
