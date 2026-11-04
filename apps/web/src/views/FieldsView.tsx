import { curveAt, fieldPlans } from "@emporion/engine";
import { asset, content } from "../content";
import { int } from "../format";
import { useNav } from "../nav";
import { art, useSession } from "../ui";

// The resource fields, laid out like the town's building sites: a card per
// field with its resource, its level badge (bronze when it can be raised now,
// ringed while builders are at work) and what it yields an hour. Fields are
// grouped by resource; the town itself stands at the gate, as the Muster
// Ground does in the town view.
const ORDER = content.resources.map((r) => r.id);

export function FieldsView() {
  const s = useSession();
  const nav = useNav();
  const v = s.state.villages[s.villageId]!;
  const plans = fieldPlans(s.state, content, v);
  const layout = v.layoutId ? content.layouts[v.layoutId] : undefined;
  const speed = s.state.settings.speed;
  const fields = v.fields.map((f, i) => ({ f, i })).sort((a, b) => ORDER.indexOf(a.f.resource) - ORDER.indexOf(b.f.resource) || a.i - b.i);
  return (
    <div className="fields-view">
      <div className="polis estate">
        <div className="polis__ring">
          <div className="polis__grid" role="list">
            {fields.map(({ f, i }) => {
              const plan = plans[i]!;
              const building = v.buildQueue.some((j) => j.kind === "field" && j.index === i);
              const def = content.fields[f.resource]!;
              const icon = content.resources.find((r) => r.id === f.resource)?.icon;
              const rate = curveAt(def.production, f.level) * speed;
              return (
                <button
                  key={i}
                  role="listitem"
                  className={`site site--field field--${f.resource}${building ? " is-building" : ""}${plan.check.ok ? " is-ready" : ""}`}
                  onClick={() => nav.open({ kind: "field", index: i })}
                  title={`${def.name}, level ${f.level}: ${int(rate)} an hour${building ? `, building to ${plan.fromLevel}` : ""}`}
                >
                  {icon && <img className="site__art site__art--field" src={asset(icon)} alt="" />}
                  <span className="site__name">
                    {def.name}
                    <small className="site__rate">+{int(rate)}/h</small>
                  </span>
                  <span className="site__badge">
                    {f.level}
                    {building && <span className="site__next">→{plan.fromLevel}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="polis__gate">
            <button className="site site--muster site--town" onClick={() => nav.go("town")} title="Enter the town">
              <img className="site__art" src={art("v-town")} alt="" />
              <span className="site__name">{v.name}</span>
            </button>
          </div>
        </div>
      </div>
      <p className="fields-view__caption">
        {layout?.name ?? "Custom"} fields · ({v.x}|{v.y})
      </p>
    </div>
  );
}
