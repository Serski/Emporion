import { useState } from "react";
import {
  armoryCheck,
  armoryUpgradeCost,
  isResearched,
  rallyPoint,
  researchCheck,
  scaleResources,
  trainOptions,
  troopCount,
  type UnitDef,
} from "@emporion/engine";
import { content } from "../content";
import { duration, int } from "../format";
import { useNav } from "../nav";
import { Cost, Countdown, TroopList, UnitIcon, useSession } from "../ui";

export function UnitStats({ unit }: { unit: UnitDef }) {
  return (
    <dl className="unit-stats">
      <div>
        <dt>Attack</dt>
        <dd>{unit.attack}</dd>
      </div>
      <div>
        <dt>Def. foot</dt>
        <dd>{unit.defenseInfantry}</dd>
      </div>
      <div>
        <dt>Def. horse</dt>
        <dd>{unit.defenseCavalry}</dd>
      </div>
      <div>
        <dt>Speed</dt>
        <dd>{unit.speed}</dd>
      </div>
      <div>
        <dt>Carry</dt>
        <dd>{unit.carry}</dd>
      </div>
      <div>
        <dt>Wheat/h</dt>
        <dd>{unit.upkeep}</dd>
      </div>
    </dl>
  );
}

const roleNote: Record<string, string> = {
  scout: "Scout: spies on towns and oases, and catches enemy scouts.",
  ram: "Ram: survivors of a won attack batter the walls down.",
  catapult: "Siege engine: survivors of a won attack knock buildings down.",
  chief: "Envoy: each survivor of a won attack lowers the town's loyalty. At zero the town is yours.",
  settler: "Settler: send three together to found a town on an empty valley.",
};

export function TrainPanel({ buildingId }: { buildingId: string }) {
  const s = useSession();
  const v = s.state.villages[s.villageId]!;
  const now = s.now();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const opts = trainOptions(s.state, content, v).filter((o) => o.unit.building.includes(buildingId));
  const queue = v.training.filter((b) => b.buildingId === buildingId);
  return (
    <section className="subpanel">
      <h3 className="subpanel__title">Train</h3>
      <ul className="unit-list">
        {opts.map((o) => {
          const n = Math.max(0, Math.floor(Number(counts[o.unit.id] ?? "") || 0));
          return (
            <li key={o.unit.id} className={`unit-row${o.check.ok ? "" : " is-locked"}`}>
              <UnitIcon id={o.unit.id} size={56} />
              <div className="unit-row__info">
                <div className="unit-row__name">
                  {o.unit.name}
                  <span className="muted small"> · at home {int(v.troops[o.unit.id] ?? 0)}</span>
                </div>
                {o.unit.description && <p className="small muted">{o.unit.description}</p>}
                {o.unit.role && <p className="small">{roleNote[o.unit.role]}</p>}
                <UnitStats unit={o.unit} />
                <Cost cost={o.unit.cost} have={v.resources} time={o.unitMs} />
              </div>
              <form
                className="unit-row__act"
                onSubmit={(e) => {
                  e.preventDefault();
                  const r = s.run((g, t) => g.train(s.active, v.id, o.unit.id, n, t), `Training ${n} ${o.unit.plural ?? o.unit.name}.`);
                  if (r.ok) setCounts((c) => ({ ...c, [o.unit.id]: "" }));
                }}
              >
                {o.check.ok ? (
                  <>
                    <label className="visually-hidden" htmlFor={`train-${o.unit.id}`}>
                      How many {o.unit.plural ?? o.unit.name}
                    </label>
                    <input
                      id={`train-${o.unit.id}`}
                      type="number"
                      min={0}
                      max={o.maxCount}
                      inputMode="numeric"
                      value={counts[o.unit.id] ?? ""}
                      placeholder="0"
                      onChange={(e) => setCounts((c) => ({ ...c, [o.unit.id]: e.target.value }))}
                    />
                    <button type="button" className="link small" onClick={() => setCounts((c) => ({ ...c, [o.unit.id]: String(o.maxCount) }))}>
                      max {int(o.maxCount)}
                    </button>
                    <button className="btn btn--primary" disabled={n < 1 || n > o.maxCount}>
                      Train
                    </button>
                    {n > 0 && <span className="small muted">{duration(n * o.unitMs)} in all</span>}
                    {n > 0 && <Cost cost={scaleResources(o.unit.cost, n)} have={v.resources} />}
                  </>
                ) : (
                  <p className="note note--warn">{o.check.message}</p>
                )}
              </form>
            </li>
          );
        })}
      </ul>
      {queue.length > 0 && (
        <div className="queue">
          <div className="eyebrow">In training</div>
          <ul className="list">
            {queue.map((b) => {
              const end = b.startAt + b.count * b.unitMs;
              return (
                <li key={b.id} className="list__row">
                  <span className="list__unit">
                    <UnitIcon id={b.unitId} size={24} /> {b.count - b.done} × {content.units[b.unitId]?.name}
                  </span>
                  <span className="muted small">
                    all done in <Countdown to={end} now={now} />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

export function ResearchPanel() {
  const s = useSession();
  const v = s.state.villages[s.villageId]!;
  const now = s.now();
  const units = content.factions[s.player.factionId]!.units.filter((u) => u.research);
  const job = v.research.job;
  return (
    <section className="subpanel">
      <h3 className="subpanel__title">Research</h3>
      {job && (
        <p className="note">
          Researching {content.units[job.unitId]?.name}: ready in <Countdown to={job.endAt} now={now} />
        </p>
      )}
      <ul className="unit-list">
        {units.map((u) => {
          const done = isResearched(v, u);
          const check = researchCheck(s.state, content, v, u);
          return (
            <li key={u.id} className={`unit-row unit-row--compact${done ? " is-done" : ""}`}>
              <UnitIcon id={u.id} size={44} />
              <div className="unit-row__info">
                <div className="unit-row__name">{u.name}</div>
                {done ? (
                  <p className="small good">Researched</p>
                ) : (
                  <>
                    <Cost cost={u.research!.cost} have={v.resources} time={check.ok ? check.durationMs : undefined} />
                    {!check.ok && <p className="note note--warn">{check.message}</p>}
                  </>
                )}
              </div>
              {!done && (
                <div className="unit-row__act">
                  <button className="btn btn--primary" disabled={!check.ok} onClick={() => s.run((g, t) => g.research(s.active, v.id, u.id, t), `Researching ${u.name}.`)}>
                    Research
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ArmoryPanel() {
  const s = useSession();
  const v = s.state.villages[s.villageId]!;
  const now = s.now();
  const units = content.factions[s.player.factionId]!.units.filter((u) => u.building.length > 0 && isResearched(v, u));
  const job = v.armory.job;
  return (
    <section className="subpanel">
      <h3 className="subpanel__title">Improve arms and armour</h3>
      <p className="muted small">Each level adds {Math.round(content.world.combat.armoryBonusPerLevel * 1000) / 10}% attack and defence to that unit, for troops that march out after it is done.</p>
      {job && (
        <p className="note">
          {content.units[job.unitId]?.name} to level {job.level}: ready in <Countdown to={job.endAt} now={now} />
        </p>
      )}
      <ul className="unit-list">
        {units.map((u) => {
          const level = v.armory.levels[u.id] ?? 0;
          const check = armoryCheck(s.state, content, v, u);
          return (
            <li key={u.id} className="unit-row unit-row--compact">
              <UnitIcon id={u.id} size={44} />
              <div className="unit-row__info">
                <div className="unit-row__name">
                  {u.name} <span className="tag">level {level}</span>
                </div>
                <Cost cost={armoryUpgradeCost(content, u, level + 1)} have={v.resources} time={check.ok ? check.durationMs : undefined} />
                {!check.ok && <p className="note note--warn">{check.message}</p>}
              </div>
              <div className="unit-row__act">
                <button className="btn btn--primary" disabled={!check.ok} onClick={() => s.run((g, t) => g.upgradeUnit(s.active, v.id, u.id, t), `Improving ${u.name}.`)}>
                  Improve
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function MusterPanel() {
  const s = useSession();
  const nav = useNav();
  const v = s.state.villages[s.villageId]!;
  const rp = rallyPoint(content, v);
  const away: { host: string; tile: number | null; villageId: string | null; troops: Record<string, number> }[] = [];
  for (const hv of Object.values(s.state.villages)) {
    for (const g of hv.stationed) if (g.homeVillageId === v.id) away.push({ host: hv.name, tile: null, villageId: hv.id, troops: g.troops });
  }
  for (const o of Object.values(s.state.oases)) {
    for (const g of o.stationed) if (g.homeVillageId === v.id) away.push({ host: content.oasisTypes[o.typeId]?.name ?? "Oasis", tile: o.tile, villageId: null, troops: g.troops });
  }
  return (
    <section className="subpanel">
      <div className="subpanel__head">
        <h3 className="subpanel__title">Muster</h3>
        <button className="btn btn--primary" onClick={() => nav.open({ kind: "send" })}>
          Send troops
        </button>
      </div>
      {rp && rp.level < rp.chooseTargetFrom && <p className="muted small">Siege engines aim at chosen targets from level {rp.chooseTargetFrom}.</p>}
      <div className="eyebrow">At home</div>
      <TroopList troops={v.troops} empty="No troops at home." />
      <div className="eyebrow">Reinforcements in {v.name}</div>
      {v.stationed.length === 0 ? (
        <p className="muted">None. Allies and your other towns can station troops here; you feed them.</p>
      ) : (
        <ul className="list">
          {v.stationed.map((g) => (
            <li key={g.homeVillageId} className="list__block">
              <div className="list__row">
                <span>
                  From {s.state.villages[g.homeVillageId]?.name ?? "?"} ({s.state.players[g.ownerId]?.name}){g.hero && " with their hero"}
                </span>
                <button className="btn btn--small" onClick={() => s.run((gm, t) => gm.withdraw(s.active, { villageId: v.id }, g.homeVillageId, t), "Sent home.")}>
                  Send home
                </button>
              </div>
              <TroopList troops={g.troops} />
            </li>
          ))}
        </ul>
      )}
      <div className="eyebrow">Your troops stationed elsewhere</div>
      {away.length === 0 ? (
        <p className="muted">None.</p>
      ) : (
        <ul className="list">
          {away.map((a, i) => (
            <li key={i} className="list__block">
              <div className="list__row">
                <span>In {a.host}</span>
                <button
                  className="btn btn--small"
                  onClick={() => s.run((gm, t) => gm.withdraw(s.active, a.villageId ? { villageId: a.villageId } : { oasisTile: a.tile! }, v.id, t), "Recalled.")}
                >
                  Recall
                </button>
              </div>
              <TroopList troops={a.troops} />
            </li>
          ))}
        </ul>
      )}
      {troopCount(v.troops) === 0 && <p className="muted small">Train troops in the Barracks first.</p>}
    </section>
  );
}
