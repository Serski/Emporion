import { fieldPlans } from "@emporion/engine";
import { content } from "../content";
import { useNav } from "../nav";
import { ResIcon, art, useSession } from "../ui";

// The eighteen fields around the town, on two rings: six close to the walls,
// twelve beyond. A badge shows each field's level: bronze when it can be
// raised now, dark when it cannot, ringed while builders are at work.
const INNER = 6;

function position(i: number, n: number) {
  const inner = i < INNER;
  const k = inner ? i : i - INNER;
  const count = inner ? INNER : n - INNER;
  const angle = ((k + (inner ? 0.5 : 0)) / count) * Math.PI * 2 - Math.PI / 2;
  const r = inner ? 25 : 41.5;
  return { left: 50 + r * Math.cos(angle), top: 50 + r * Math.sin(angle) };
}

export function FieldsView() {
  const s = useSession();
  const nav = useNav();
  const v = s.state.villages[s.villageId]!;
  const plans = fieldPlans(s.state, content, v);
  const layout = v.layoutId ? content.layouts[v.layoutId] : undefined;
  return (
    <div className="fields-view">
      <div className="fields-ring" role="list">
        <div className="fields-ring__land" aria-hidden />
        <button className="fields-ring__town" onClick={() => nav.go("town")} title="Enter the town">
          <img src={art("v-town")} alt="" />
          <span className="fields-ring__town-name">{v.name}</span>
        </button>
        {v.fields.map((f, i) => {
          const pos = position(i, v.fields.length);
          const plan = plans[i]!;
          const building = v.buildQueue.some((j) => j.kind === "field" && j.index === i);
          const def = content.fields[f.resource]!;
          return (
            <button
              key={i}
              role="listitem"
              className={`plot plot--${f.resource}${building ? " is-building" : ""}${plan.check.ok ? " is-ready" : ""}`}
              style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
              onClick={() => nav.open({ kind: "field", index: i })}
              title={`${def.name}, level ${f.level}${building ? `, building to ${plan.fromLevel}` : ""}`}
            >
              <ResIcon id={f.resource} size={34} />
              <span className="plot__level">{f.level}</span>
              {building && <span className="plot__next">→{plan.fromLevel}</span>}
            </button>
          );
        })}
      </div>
      <p className="fields-view__caption">
        {layout?.name ?? "Custom"} fields · ({v.x}|{v.y})
      </p>
    </div>
  );
}
