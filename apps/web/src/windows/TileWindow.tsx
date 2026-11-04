import { distance, tileDetails, tileIndex, travelDistance, type MissionKind } from "@emporion/engine";
import { content } from "../content";
import { int, pct } from "../format";
import { useNav } from "../nav";
import { Modal, ResIcon, TroopList, factionName, useSession } from "../ui";

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
