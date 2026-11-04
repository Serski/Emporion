import { useState } from "react";
import {
  constructionOptions,
  curveAt,
  planBuild,
  villageSummary,
  type BuildingDef,
  type BuildPlan,
  type Resources,
  type Village,
} from "@emporion/engine";
import { duration, int, pct } from "../format";
import { useNav } from "../nav";
import { asset, content } from "../content";
import { Cost, Modal, art, buildingArt, useSession } from "../ui";
import { ArmoryPanel, MusterPanel, ResearchPanel, TrainPanel } from "./MilitaryPanels";
import { ExpansionPanel, FestivalPanel, HeroonPanel, MarketPanel, TreasuryPanel } from "./CivicPanels";
import { AgoraPanel, AltarPanel, CraftPanel, HoldingPanel, PortPanel } from "./MassaliaPanels";

// How long until the stock covers `cost` at current net production, or why never.
function waitFor(v: Village, cost: Resources, net: Resources, capacity: Resources): string | null {
  let worst = 0;
  for (const [r, c] of Object.entries(cost)) {
    const have = v.resources[r] ?? 0;
    if (have + 1e-6 >= c) continue;
    if (c > (capacity[r] ?? 0)) return `Your stores cannot hold ${int(c)} ${content.resources.find((x) => x.id === r)?.name.toLowerCase()}. Raise the ${r === content.food ? "Granary" : "Storehouse"}.`;
    const rate = net[r] ?? 0;
    if (rate <= 0) return `No ${content.resources.find((x) => x.id === r)?.name.toLowerCase()} is coming in.`;
    worst = Math.max(worst, ((c - have) / rate) * 3_600_000);
  }
  return worst > 0 ? `Enough resources in ${duration(worst)}.` : null;
}

export function UpgradeBlock({ plan, onRun, verb = "Raise to level" }: { plan: BuildPlan; onRun: () => void; verb?: string }) {
  const s = useSession();
  const v = s.state.villages[s.villageId]!;
  const sum = villageSummary(s.state, content, v);
  if (plan.toLevel > plan.maxLevel) return <p className="note note--done">Highest level reached ({plan.maxLevel}).</p>;
  const short = !plan.check.ok && plan.check.code === "insufficient" ? waitFor(v, plan.cost, sum.net, sum.capacity) : null;
  return (
    <div className="upgrade">
      <div className="upgrade__head">
        <span className="upgrade__title">
          {verb} {plan.toLevel}
        </span>
        <button className="btn btn--buy" disabled={!plan.check.ok} onClick={onRun}>
          {plan.fromLevel === 0 && plan.target.kind === "building" ? "Build" : "Upgrade"}
        </button>
      </div>
      <Cost cost={plan.cost} have={v.resources} time={plan.durationMs} />
      {plan.pop > 0 && <p className="muted small">Adds {plan.pop} people, who eat {plan.pop} wheat per hour.</p>}
      {!plan.check.ok && <p className="note note--warn">{short ?? plan.check.message}</p>}
    </div>
  );
}

// What a building does at a level, in plain lines.
export function effectLines(def: BuildingDef, level: number, factionWallBonus: number, cacheMultiplier: number): string[] {
  const e = def.effects;
  const out: string[] = [];
  if (e.storage) {
    const names = e.storage.resources.map((r) => content.resources.find((x) => x.id === r)?.name.toLowerCase()).join(", ");
    out.push(`Holds ${int(curveAt(e.storage.capacity, level))} of ${names}`);
  }
  if (e.buildTime) out.push(`Construction takes ${pct(curveAt(e.buildTime, level))} of the base time`);
  if (e.trainTime) out.push(`Training takes ${pct(curveAt(e.trainTime, level))} of the base time`);
  if (e.researchTime) out.push(`Research takes ${pct(curveAt(e.researchTime, level))} of the base time`);
  if (e.upgradeTime) out.push(`Upgrades take ${pct(curveAt(e.upgradeTime, level))} of the base time`);
  if (e.hide) out.push(`Hides ${int(curveAt(e.hide, level) * cacheMultiplier)} of every resource from raiders`);
  for (const p of e.production ?? []) out.push(`+${pct(curveAt(p.bonus, level))} ${content.fields[p.resource]?.name} output`);
  if (e.merchants) out.push(`${Math.floor(curveAt(e.merchants, level))} merchants`);
  if (e.merchantCapacity) out.push(`Merchants carry +${pct(curveAt(e.merchantCapacity, level))}`);
  if (e.wall) out.push(`Defence +${pct((1 + factionWallBonus) ** level - 1)}`);
  if (e.troopSpeed) out.push(`Troops march +${pct(curveAt(e.troopSpeed.bonus, level))} faster beyond ${e.troopSpeed.beyond} fields`);
  if (e.rallyPoint) {
    if (level >= e.rallyPoint.twoTargetsFrom) out.push("Siege engines may aim at two targets");
    else if (level >= e.rallyPoint.chooseTargetFrom) out.push("Siege engines may aim at one target");
    else out.push(`Siege engines hit at random (aim from level ${e.rallyPoint.chooseTargetFrom})`);
  }
  if (e.expansionSlots) out.push(`${e.expansionSlots.filter((l) => level >= l).length} expansion slots (one at each of levels ${e.expansionSlots.join(", ")})`);
  if (e.loyaltyRegen) out.push(`Loyalty recovers +${curveAt(e.loyaltyRegen, level).toFixed(2)}% per hour`);
  if (e.oasisSlots) out.push(`${e.oasisSlots.filter((l) => level >= l).length} oasis slots (one at each of levels ${e.oasisSlots.join(", ")})`);
  if (e.heroRevive) out.push(`Hero revives in ${pct(curveAt(e.heroRevive, level))} of the base time`);
  if (e.treasures) out.push(`Keeps ${int(curveAt(e.treasures, level))} treasures`);
  if (e.festivalTime) out.push(`Festivals take ${pct(curveAt(e.festivalTime, level))} of the base time`);
  return out;
}

function Effects({ def, level }: { def: BuildingDef; level: number }) {
  const s = useSession();
  const faction = content.factions[s.player.factionId]!;
  const now = level > 0 ? effectLines(def, level, faction.wall.bonusPerLevel, faction.cacheMultiplier) : [];
  const next = level < def.maxLevel ? effectLines(def, level + 1, faction.wall.bonusPerLevel, faction.cacheMultiplier) : [];
  if (now.length === 0 && next.length === 0) return null;
  return (
    <div className="effects">
      {now.length > 0 && (
        <div>
          <div className="eyebrow">Now</div>
          <ul className="bullets">
            {now.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      )}
      {next.length > 0 && (
        <div>
          <div className="eyebrow">At level {level + 1}</div>
          <ul className="bullets bullets--next">
            {next.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Painted MASSALIA banners over the windows of the buildings that have one.
const BANNERS: Record<string, string> = {
  agora: "banner-market",
  theatre: "banner-dionysia",
  hippodrome: "banner-olympic",
  harbor: "banner-harbor",
  prytaneion: "banner-court",
  treasury: "banner-ledger",
  oikist_house: "banner-politics",
};

export function FieldWindow({ index, onClose }: { index: number; onClose: () => void }) {
  const s = useSession();
  const v = s.state.villages[s.villageId]!;
  const f = v.fields[index]!;
  const def = content.fields[f.resource]!;
  const plan = planBuild(s.state, content, v, { kind: "field", index });
  const speed = s.state.settings.speed;
  const now = curveAt(def.production, f.level) * speed;
  const next = curveAt(def.production, plan.toLevel) * speed;
  return (
    <Modal
      title={`${def.name}`}
      eyebrow={`Level ${f.level}${plan.fromLevel > f.level ? ` · building to ${plan.fromLevel}` : ""}`}
      onClose={onClose}
      image={(() => {
        const icon = content.resources.find((r) => r.id === f.resource)?.icon;
        return icon ? asset(icon) : undefined;
      })()}
    >
      <p className="lede">{def.description}</p>
      <div className="effects">
        <div>
          <div className="eyebrow">Now</div>
          <p className="big-num">{int(now)}/h</p>
        </div>
        {plan.toLevel <= plan.maxLevel && (
          <div>
            <div className="eyebrow">At level {plan.toLevel}</div>
            <p className="big-num big-num--next">{int(next)}/h</p>
          </div>
        )}
      </div>
      <UpgradeBlock plan={plan} onRun={() => s.run((g, t) => g.upgradeField(s.active, v.id, index, t), `${def.name} is being raised.`)} />
      <p className="muted small">
        Highest level here: {v.isCapital ? def.maxLevelCapital : def.maxLevel}
        {v.isCapital ? " (capital)" : ` (${def.maxLevelCapital} in your capital)`}.
      </p>
    </Modal>
  );
}

export function BuildingWindow({ slot, onClose }: { slot: number; onClose: () => void }) {
  const s = useSession();
  const v = s.state.villages[s.villageId]!;
  const b = v.buildings[slot];
  const queued = v.buildQueue.find((j) => j.kind === "building" && j.index === slot);
  const def = content.buildings[b?.id ?? queued!.buildingId]!;
  const level = b?.level ?? 0;
  const plan = planBuild(s.state, content, v, { kind: "building", slot, buildingId: def.id });
  const faction = content.factions[s.player.factionId]!;
  const trains = faction.units.some((u) => u.building.includes(def.id));
  const e = def.effects;
  return (
    <Modal
      title={def.name}
      eyebrow={`Level ${level}${plan.fromLevel > level ? ` · building to ${plan.fromLevel}` : ""}`}
      onClose={onClose}
      image={buildingArt(def.id).src}
      banner={BANNERS[def.id] ? art(BANNERS[def.id]!) : undefined}
      wide={trains || !!e.rallyPoint || !!e.research || !!e.armory || !!e.merchants || !!e.goods || content.massalia.crafting.recipes.some((r) => r.building === def.id)}
    >
      <p className="lede">{def.description}</p>
      <Effects def={def} level={level} />
      {e.goods && level === 0 && <HoldingPanel buildingId={def.id} level={0} />}
      <UpgradeBlock plan={plan} onRun={() => s.run((g, t) => g.upgradeBuilding(s.active, v.id, slot, t), `${def.name} is being raised.`)} />
      {level > 0 && (
        <>
          {e.buildTime && <RenamePanel />}
          {trains && <TrainPanel buildingId={def.id} />}
          {e.research && <ResearchPanel />}
          {e.armory && <ArmoryPanel />}
          {e.rallyPoint && <MusterPanel />}
          {def.id === content.massalia.market.building && <AgoraPanel />}
          {e.merchants && <MarketPanel />}
          {e.goods && <HoldingPanel buildingId={def.id} level={level} />}
          {def.id === content.massalia.crafting.altar.building && <AltarPanel />}
          {content.massalia.crafting.recipes.some((r) => r.building === def.id) && <CraftPanel buildingId={def.id} />}
          {def.id === content.massalia.ships.port && <PortPanel />}
          {e.festivals && <FestivalPanel />}
          {e.expansionSlots && <ExpansionPanel />}
          {e.oasisSlots && <HeroonPanel />}
          {e.treasures && <TreasuryPanel />}
        </>
      )}
      {level === 0 && <p className="muted">Its uses open once the first level is finished.</p>}
    </Modal>
  );
}

function RenamePanel() {
  const s = useSession();
  const v = s.state.villages[s.villageId]!;
  const [name, setName] = useState(v.name);
  return (
    <section className="subpanel">
      <h3 className="subpanel__title">Rename the town</h3>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          s.run((g, t) => g.renameVillage(s.active, v.id, name, t), "Renamed.");
        }}
      >
        <input id="rename-town" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} aria-label="Town name" />
        <button className="btn" type="submit">
          Rename
        </button>
      </form>
    </section>
  );
}

export function ConstructWindow({ slot, onClose }: { slot: number; onClose: () => void }) {
  const s = useSession();
  const nav = useNav();
  const v = s.state.villages[s.villageId]!;
  const options = constructionOptions(s.state, content, v, slot);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? options : options.filter((o) => o.available);
  return (
    <Modal title="Build on this site" eyebrow={`Site ${slot + 1}`} onClose={onClose} wide>
      {shown.length === 0 && <p className="muted">Nothing can be built here yet. Show the locked buildings to see what they need.</p>}
      <ul className="build-list">
        {shown.map((o) => (
          <li key={o.def.id} className={`build-option${o.available ? "" : " is-locked"}`}>
            <img className={`build-option__art${buildingArt(o.def.id).icon ? " build-option__art--icon" : ""}`} src={buildingArt(o.def.id).src} alt="" width={72} height={72} loading="lazy" />
            <div className="build-option__text">
              <h3 className="build-option__name">{o.def.name}</h3>
              <p className="small">{o.def.description}</p>
              {!o.available && <p className="note note--warn">{o.reason}</p>}
            </div>
            <div className="build-option__act">
              <Cost cost={o.plan.cost} have={v.resources} time={o.plan.durationMs} />
              <button
                className="btn btn--buy"
                disabled={!o.available || !o.plan.check.ok}
                title={o.plan.check.ok ? undefined : o.plan.check.message}
                onClick={() => {
                  const r = s.run((g, t) => g.construct(s.active, v.id, slot, o.def.id, t), `${o.def.name} is going up.`);
                  if (r.ok) nav.close();
                }}
              >
                Build
              </button>
              {o.available && !o.plan.check.ok && <p className="muted small">{o.plan.check.message}</p>}
            </div>
          </li>
        ))}
      </ul>
      <button className="btn btn--ghost" onClick={() => setShowAll((x) => !x)}>
        {showAll ? "Hide locked buildings" : "Show locked buildings and their requirements"}
      </button>
    </Modal>
  );
}
