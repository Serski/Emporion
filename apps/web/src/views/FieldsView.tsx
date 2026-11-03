import { fieldPlans, villageSummary } from "@emporion/engine";
import { content } from "../content";
import { int, signed } from "../format";
import { useNav } from "../nav";
import { ResIcon, useSession } from "../ui";

// The eighteen fields around the town, on two rings: the inner six close to
// the walls, the outer twelve beyond. Click a field to raise it.
const INNER = 6;

function position(i: number, n: number) {
  const inner = i < INNER;
  const k = inner ? i : i - INNER;
  const count = inner ? INNER : n - INNER;
  const angle = ((k + (inner ? 0.5 : 0)) / count) * Math.PI * 2 - Math.PI / 2;
  const r = inner ? 24 : 41;
  return { left: 50 + r * Math.cos(angle), top: 50 + r * Math.sin(angle) };
}

export function FieldsView() {
  const s = useSession();
  const nav = useNav();
  const v = s.state.villages[s.villageId]!;
  const plans = fieldPlans(s.state, content, v);
  const sum = villageSummary(s.state, content, v);
  const layout = v.layoutId ? content.layouts[v.layoutId] : undefined;
  return (
    <div className="fields-view">
      <div className="view-head">
        <div>
          <div className="eyebrow">
            Resource fields · {layout?.name ?? "custom"} · ({v.x}|{v.y})
          </div>
          <h1 className="view-title">{v.name}</h1>
        </div>
        <div className="prod-summary">
          {content.resourceIds.map((r) => (
            <span key={r} className="prod-chip">
              <ResIcon id={r} size={18} /> {signed(sum.net[r] ?? 0)}/h
            </span>
          ))}
        </div>
      </div>
      <div className="fields-ring" role="list">
        <div className="fields-ring__land" aria-hidden />
        <button className="fields-ring__town" onClick={() => nav.go("town")}>
          <span className="fields-ring__town-name">{v.name}</span>
          <span className="fields-ring__town-hint">Enter the town</span>
        </button>
        {v.fields.map((f, i) => {
          const pos = position(i, v.fields.length);
          const plan = plans[i]!;
          const building = v.buildQueue.some((j) => j.kind === "field" && j.index === i);
          const ready = plan.check.ok;
          const def = content.fields[f.resource]!;
          return (
            <button
              key={i}
              role="listitem"
              className={`plot plot--${f.resource}${building ? " is-building" : ""}${ready ? " is-ready" : ""}`}
              style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
              onClick={() => nav.open({ kind: "field", index: i })}
              title={`${def.name} level ${f.level}${building ? ` → ${plan.fromLevel}` : ""}`}
            >
              <ResIcon id={f.resource} size={30} />
              <span className="plot__level">{f.level}</span>
              {building && <span className="plot__next">→{plan.fromLevel}</span>}
            </button>
          );
        })}
      </div>
      <table className="table fields-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Count</th>
            <th>Levels</th>
            <th>Output</th>
          </tr>
        </thead>
        <tbody>
          {content.resourceIds.map((r) => {
            const mine = v.fields.filter((f) => f.resource === r);
            return (
              <tr key={r}>
                <td>
                  <span className="cell-icon">
                    <ResIcon id={r} size={18} /> {content.fields[r]?.name}
                  </span>
                </td>
                <td className="num">{mine.length}</td>
                <td className="num">{mine.map((f) => f.level).join(" · ")}</td>
                <td className="num">{int(sum.production[r] ?? 0)}/h</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
