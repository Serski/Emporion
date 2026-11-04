import { distance, tileDetails, tileIndex, travelDistance, type MissionKind } from "@emporion/engine";
import { content } from "../content";
import { int, pct } from "../format";
import { useNav } from "../nav";
import { useState } from "react";
import { plotView } from "@emporion/engine";
import { GoodIcon, Modal, ResIcon, TroopList, art, factionName, useSession } from "../ui";

const TERRAIN: Record<string, string> = { P: "Plain", H: "Hills", M: "Mountains", S: "Open sea", L: "Lake", F: "Beyond the known world" };

export function TileWindow({ tile, onClose }: { tile: number; onClose: () => void }) {
  const s = useSession();
  const nav = useNav();
  const d = tileDetails(s.state, content, tile);
  const v = s.state.villages[s.villageId]!;
  const from = tileIndex(content, v.x, v.y);
  const steps = distance(content, from, tile);
  const dist = travelDistance(content, from, tile);
  const info = d.info;
  const polity = info.polity ? content.map.polities[info.polity] : undefined;
  const kingdom = d.kingdomId ? s.state.kingdoms[d.kingdomId] : undefined;
  const send = (mission: MissionKind) => nav.open({ kind: "send", tile, mission });
  const mine = d.village?.ownerId === s.active;
  const oasisMine = d.oasis?.state?.ownerVillageId ? s.state.villages[d.oasis.state.ownerVillageId]?.ownerId === s.active : false;

  let title = `${TERRAIN[info.terrain] ?? "Land"}`;
  if (d.village) title = d.village.name;
  else if (info.oasis) title = info.oasis.name;
  else if (info.kind === "valley") title = "Free valley";
  else if (info.kind === "wild") title = "Wild land";

  return (
    <Modal title={title} eyebrow={`(${info.x}|${info.y})${info.regionName ? ` · ${info.regionName}` : ""}${polity ? ` · ${polity.name}` : ""}`} onClose={onClose}>
      <ul className="facts">
        <li>
          <span>Terrain</span>
          {TERRAIN[info.terrain]}
          {info.coastal ? ", on the coast" : ""}
        </li>
        <li>
          <span>Distance</span>
          {steps} hex{steps === 1 ? "" : "es"} from {v.name}
          {dist > steps + 0.05 ? `, marched as ${dist.toFixed(1)} with the sea legs` : ""}
        </li>
        {d.state && (
          <li>
            <span>State</span>
            <span className="state-line">
              <img className="crest" src={art(`crests/${d.state.id}`)} alt="" width={22} height={22} />
              Land of the {d.state.name}
            </span>
          </li>
        )}
        {kingdom && (
          <li>
            <span>Kingdom</span>
            {kingdom.name}
          </li>
        )}
        {d.territory && d.territory.villageId !== d.village?.id && (
          <li>
            <span>Territory</span>
            {d.territory.villageName} ({d.territory.ownerId === s.active ? "yours" : d.territory.ownerName})
          </li>
        )}
        {d.village && (
          <>
            <li>
              <span>Held by</span>
              {d.village.ownerName}
              {d.village.kind === "player" ? ` (${factionName(d.village.factionId)})` : ""}
            </li>
            <li>
              <span>Kind</span>
              {d.village.kind === "town" ? "Free city" : d.village.kind === "camp" ? d.village.label : d.village.isCapital ? "Capital" : "Town"}
            </li>
            <li>
              <span>Population</span>
              {int(d.village.population)}
            </li>
            {d.fleet && (
              <li>
                <span>Fleet</span>
                {Object.entries(d.fleet)
                  .filter(([, n]) => n > 0)
                  .map(([id, n]) => `${n} ${content.ships[id]?.name}${n === 1 ? "" : "s"}`)
                  .join(" · ")}
              </li>
            )}
          </>
        )}
        {info.layout && !d.village && (
          <li>
            <span>Fields</span>
            <span className="layout-chips">
              {content.resourceIds.map((r) => (
                <span key={r} className="prod-chip">
                  <ResIcon id={r} size={16} /> {info.layout!.fields[r] ?? 0}
                </span>
              ))}
            </span>
          </li>
        )}
        {info.deposit && (
          <li>
            <span>Deposit</span>
            <span className="state-line">
              <GoodIcon id={info.deposit.good} size={22} />
              {info.deposit.name}
              {(() => {
                const b = content.buildingList.find((x) => x.deposit === info.deposit!.id);
                return b ? <span className="muted small"> · a town here may raise a {b.name}</span> : null;
              })()}
            </span>
          </li>
        )}
        {info.oasis && (
          <li>
            <span>Bonus</span>
            {Object.entries(info.oasis.bonus)
              .map(([r, b]) => `+${pct(b)} ${content.resources.find((x) => x.id === r)?.name.toLowerCase()}`)
              .join(", ")}
            {d.oasis?.ownerVillageName ? ` · held by ${d.oasis.ownerVillageName} (${d.oasis.ownerName})` : " · unclaimed"}
          </li>
        )}
      </ul>
      {info.oasis && !d.oasis?.state?.ownerVillageId && (
        <div>
          <div className="eyebrow">Wildlife</div>
          {d.oasis?.state ? (
            <TroopList troops={d.oasis.state.animals} empty="No animals left." />
          ) : (
            <p className="small muted">
              {Object.entries(info.oasis.animals)
                .map(([u, [a, b]]) => `${a}–${b} ${content.units[u]?.plural ?? u}`)
                .join(", ")}
            </p>
          )}
        </div>
      )}
      {info.kind === "valley" && !d.village && d.territory && d.territory.ownerId !== s.active && (
        <p className="note note--warn">
          This valley lies inside the borders of {d.territory.villageName}.{" "}
          {s.state.players[d.territory.ownerId]?.kind === "npc" ? "No one may found a town here." : `Only ${d.territory.ownerName} may found a town here.`}
        </p>
      )}
      {d.village && d.village.kind === "player" && !mine && <PlotPanel targetId={d.village.ownerId} />}
      <div className="actions">
        {mine && (
          <button
            className="btn btn--primary"
            onClick={() => {
              s.selectVillage(d.village!.id);
              nav.go("fields");
              nav.close();
            }}
          >
            Go to this town
          </button>
        )}
        {d.village && !mine && (
          <>
            <button className="btn btn--primary" onClick={() => send("raid")}>
              Raid
            </button>
            <button className="btn" onClick={() => send("attack")}>
              Attack
            </button>
            <button className="btn" onClick={() => send("scout")}>
              Scout
            </button>
            {d.village.kind === "player" && (
              <>
                <button className="btn" onClick={() => send("reinforce")}>
                  Reinforce
                </button>
                <button className="btn" onClick={() => nav.open({ kind: "resources", toVillageId: d.village!.id })}>
                  Send goods
                </button>
              </>
            )}
          </>
        )}
        {info.oasis && (
          <>
            {!oasisMine && (
              <>
                <button className="btn btn--primary" onClick={() => send("attack")}>
                  Attack (annex with hero)
                </button>
                <button className="btn" onClick={() => send("raid")}>
                  Raid
                </button>
                <button className="btn" onClick={() => send("scout")}>
                  Scout
                </button>
              </>
            )}
            {oasisMine && (
              <button className="btn" onClick={() => send("reinforce")}>
                Reinforce
              </button>
            )}
          </>
        )}
        {info.kind === "valley" && !d.village && (!d.territory || d.territory.ownerId === s.active) && (
          <button className="btn btn--primary" onClick={() => send("settle")}>
            Found a town here
          </button>
        )}
        <button className="btn btn--ghost" onClick={() => nav.showOnMap(tile)}>
          Show on map
        </button>
      </div>
    </Modal>
  );
}

// MASSALIA's plots against a rival house's head: poison and the knife.
function PlotPanel({ targetId }: { targetId: string }) {
  const s = useSession();
  const now = s.now();
  const [confirm, setConfirm] = useState<"poison" | "assassinate" | null>(null);
  const target = s.state.players[targetId];
  if (!target?.profile || !target.house) return null;
  const view = plotView(s.state, content, s.player, target, now);
  const head = target.house.head.name;
  return (
    <section className="subpanel">
      <h3 className="subpanel__title">Plot against {head}</h3>
      {!view.check.ok && <p className="small muted">{view.check.message}</p>}
      {confirm ? (
        <div className="inline-form">
          <span>
            {confirm === "poison" ? `Send a dose to ${head}? It is spent whatever happens.` : `Pay ${view.assassinCost} drachmae for a knife? It is spent whatever happens.`}
          </span>
          <button
            className="btn btn--danger btn--small"
            onClick={() => {
              s.run((g, t) => (confirm === "poison" ? g.poison(s.active, targetId, t) : g.assassinate(s.active, targetId, t)), "It is done. Watch your reports.");
              setConfirm(null);
            }}
          >
            Confirm
          </button>
          <button className="btn btn--ghost btn--small" onClick={() => setConfirm(null)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="actions">
          <button className="btn btn--small" disabled={!view.check.ok || view.havePoison < 1} title={view.havePoison < 1 ? "You have no poison" : undefined} onClick={() => setConfirm("poison")}>
            Poison · {Math.round(view.poison.chance * 100)}%
          </button>
          <button className="btn btn--small" disabled={!view.check.ok || s.player.purse < view.assassinCost} onClick={() => setConfirm("assassinate")}>
            Assassinate · {view.assassinCost} dr · {Math.round(view.assassination.chance * 100)}%
          </button>
        </div>
      )}
      <p className="muted small">Your intelligence and a hunting spymaster raise the odds; their wits, a physician, bodyguards and a guarding spymaster lower them.</p>
    </section>
  );
}
