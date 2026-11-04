import { useMemo, useState } from "react";
import {
  assembleFleet,
  distance,
  harbourFleet,
  marchMs,
  navalStrength,
  seaRoute,
  suppliesFor,
  troopSpace,
  merchantsNeeded,
  rallyPoint,
  slowestSpeed,
  tileDetails,
  tileIndex,
  travelDistance,
  villageSummary,
  type MissionKind,
  type Resources,
} from "@emporion/engine";
import { content } from "../content";
import { at, duration, int } from "../format";
import { useNav } from "../nav";
import { Modal, ResIcon, UnitIcon, useSession } from "../ui";

const MISSIONS: { id: MissionKind; label: string; hint: string }[] = [
  { id: "raid", label: "Raid", hint: "Fight briefly, carry off loot, come home. Both sides keep survivors." },
  { id: "attack", label: "Attack", hint: "Fight to the end. Rams, siege engines and envoys only work here." },
  { id: "scout", label: "Scout", hint: "Scouts only. Report resources, troops and defences." },
  { id: "reinforce", label: "Reinforce", hint: "Station troops in a town or your oasis. The host feeds them." },
  { id: "settle", label: "Found town", hint: "Exactly three settlers to an empty valley, carrying the founding stores." },
];

function parseXY(text: string): { x: number; y: number } | null {
  const m = text.match(/(-?\d+)\s*[|,; ]\s*(-?\d+)/);
  if (!m) return null;
  return { x: Number(m[1]), y: Number(m[2]) };
}

export function SendWindow({ tile, mission, onClose }: { tile?: number; mission?: MissionKind; onClose: () => void }) {
  const s = useSession();
  const nav = useNav();
  const v = s.state.villages[s.villageId]!;
  const now = s.now();
  const w = content.map.width;
  const [target, setTarget] = useState(tile !== undefined ? `${tile % w}|${Math.floor(tile / w)}` : "");
  const [kind, setKind] = useState<MissionKind>(mission ?? "raid");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [withHero, setWithHero] = useState(false);
  const [aim, setAim] = useState<[string, string]>(["random", "random"]);
  const hero = s.player.hero;
  const heroHere = !!hero && hero.status === "home" && hero.homeVillageId === v.id;

  const xy = parseXY(target);
  const toTile = xy && xy.x >= 0 && xy.y >= 0 && xy.x < w && xy.y < content.map.height ? tileIndex(content, xy.x, xy.y) : null;
  const details = toTile !== null ? tileDetails(s.state, content, toTile) : null;
  const troops: Record<string, number> = {};
  for (const [u, c] of Object.entries(counts)) {
    const n = Math.max(0, Math.min(v.troops[u] ?? 0, Math.floor(Number(c) || 0)));
    if (n > 0) troops[u] = n;
  }
  const fromTile = tileIndex(content, v.x, v.y);
  const any = Object.keys(troops).length > 0 || (withHero && heroHere);
  const speed = slowestSpeed(content, troops, withHero && heroHere ? content.hero.speed : null);
  const travel = toTile !== null && any ? marchMs(s.state, content, v, fromTile, toTile, speed) : null;
  const dist = toTile !== null ? travelDistance(content, fromTile, toTile) : null;
  const steps = toTile !== null ? distance(content, fromTile, toTile) : null;
  const catapults = Object.entries(troops).some(([u]) => content.units[u]?.role === "catapult");
  const rp = rallyPoint(content, v);
  const aimSlots = kind === "attack" && catapults && rp ? (rp.level >= rp.twoTargetsFrom ? 2 : rp.level >= rp.chooseTargetFrom ? 1 : 0) : 0;
  const targetsList = useMemo(
    () => [
      ...content.buildingList.filter((b) => !b.catapultImmune).map((b) => ({ id: b.id, name: b.name })),
      ...content.resourceIds.map((r) => ({ id: r, name: content.fields[r]!.name })),
    ],
    [],
  );
  const units = content.factions[s.player.factionId]!.units.filter((u) => (v.troops[u.id] ?? 0) > 0);

  // Over open sea the troops need hulls (picked as MASSALIA's assembleFleet does).
  const route = toTile !== null ? seaRoute(content, fromTile, toTile) : null;
  const sea = (() => {
    if (!route?.crossesSea || !any) return null;
    const space = troopSpace(content, troops, withHero && heroHere);
    const tv = details?.village ? s.state.villages[details.village.id] : undefined;
    const escort = (kind === "attack" || kind === "raid") && !!tv && navalStrength(content, harbourFleet(s.state, content, tv)) > 0;
    const picked = assembleFleet(content, s.player, space, route.zones, escort);
    const theirs = tv ? navalStrength(content, harbourFleet(s.state, content, tv)) : 0;
    return { space, zones: route.zones, picked, theirs };
  })();

  const send = () => {
    if (toTile === null) return s.notify("Enter target coordinates, for example 80|60.", "error");
    const r = s.run(
      (g, t) => g.send({ playerId: s.active, fromVillageId: v.id, toTile, mission: kind, troops, hero: withHero && heroHere, targets: aimSlots > 0 ? aim.slice(0, aimSlots) : [] }, t),
      "On the march.",
    );
    if (r.ok) nav.close();
  };

  return (
    <Modal title="Send troops" eyebrow={`From ${v.name} (${v.x}|${v.y})`} onClose={onClose} wide>
      <div className="send-grid">
        <div>
          <label className="field">
            <span className="field__label">Target (x|y)</span>
            <input id="send-target" value={target} placeholder="80|60" onChange={(e) => setTarget(e.target.value)} />
          </label>
          {details && (
            <p className="small">
              {details.village ? (
                <>
                  <strong>{details.village.name}</strong> · {details.village.ownerName}
                  {details.village.kind !== "player" ? ` (${details.village.label})` : ""} · population {int(details.village.population)}
                </>
              ) : details.info.oasis ? (
                <>
                  <strong>{details.info.oasis.name}</strong> · {details.oasis?.ownerVillageName ? `held by ${details.oasis.ownerVillageName}` : "wild"}
                </>
              ) : details.info.kind === "valley" ? (
                <>Empty valley {details.info.layout?.name}</>
              ) : (
                <>{details.info.kind === "water" ? "Open water" : details.info.kind === "fog" ? "Beyond the known world" : "Wild land"}</>
              )}
              {details.info.regionName && <> · {details.info.regionName}</>}
            </p>
          )}
          <fieldset className="missions">
            <legend className="field__label">Mission</legend>
            {MISSIONS.map((m) => (
              <label key={m.id} className={`mission${kind === m.id ? " is-on" : ""}`}>
                <input type="radio" name="mission" value={m.id} checked={kind === m.id} onChange={() => setKind(m.id)} />
                <span className="mission__name">{m.label}</span>
                <span className="mission__hint">{m.hint}</span>
              </label>
            ))}
          </fieldset>
        </div>
        <div>
          <div className="field__label">Troops</div>
          {units.length === 0 && <p className="muted">No troops at home in {v.name}.</p>}
          <ul className="send-units">
            {units.map((u) => (
              <li key={u.id}>
                <UnitIcon id={u.id} size={34} />
                <span className="send-units__name">{u.name}</span>
                <input
                  id={`send-${u.id}`}
                  type="number"
                  min={0}
                  max={v.troops[u.id]}
                  inputMode="numeric"
                  value={counts[u.id] ?? ""}
                  placeholder="0"
                  aria-label={`${u.name} to send`}
                  onChange={(e) => setCounts((c) => ({ ...c, [u.id]: e.target.value }))}
                />
                <button type="button" className="link small" onClick={() => setCounts((c) => ({ ...c, [u.id]: String(v.troops[u.id] ?? 0) }))}>
                  all {int(v.troops[u.id] ?? 0)}
                </button>
              </li>
            ))}
          </ul>
          {heroHere && (
            <label className="check">
              <input type="checkbox" checked={withHero} onChange={(e) => setWithHero(e.target.checked)} /> Hero {hero!.name} goes with them
            </label>
          )}
          {aimSlots > 0 &&
            Array.from({ length: aimSlots }, (_, i) => (
              <label key={i} className="field">
                <span className="field__label">Siege target {aimSlots > 1 ? i + 1 : ""}</span>
                <select
                  id={`aim-${i}`}
                  value={aim[i]}
                  onChange={(e) => setAim((a) => (i === 0 ? [e.target.value, a[1]] : [a[0], e.target.value]))}
                >
                  <option value="random">Random</option>
                  {targetsList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          {sea && (
            <div className={`note${sea.picked.ok ? "" : " note--warn"}`}>
              <strong>By sea</strong> · crosses {sea.zones} sea{sea.zones === 1 ? "" : "s"} · room needed for {sea.space} men.{" "}
              {sea.picked.ok ? (
                <>
                  Sails with{" "}
                  {Object.entries(sea.picked.ships)
                    .map(([id, n]) => `${n} ${content.ships[id]?.name}${n === 1 ? "" : "s"}`)
                    .join(" and ")}
                  , burning {suppliesFor(content, sea.picked.ships)} naval suppl{suppliesFor(content, sea.picked.ships) === 1 ? "y" : "ies"}.
                  {sea.theirs > 0 && ` The town's ships count ${sea.theirs}; your escort ${navalStrength(content, sea.picked.ships)}${navalStrength(content, sea.picked.ships) < sea.theirs ? ": the landing would be driven off." : "."}`}
                </>
              ) : (
                sea.picked.message
              )}
            </div>
          )}
          <div className="send-summary">
            {dist !== null && steps !== null && (
              <span>
                {steps} hex{steps === 1 ? "" : "es"} away{dist > steps + 0.05 ? `, marched as ${dist.toFixed(1)} with the sea legs` : ""}
              </span>
            )}
            {travel !== null && (
              <span>
                March {duration(travel)} · arrives {at(now + travel, s.state.settings.startedAt)}
              </span>
            )}
          </div>
          <button className="btn btn--primary btn--wide" disabled={!any || toTile === null} onClick={send}>
            Send
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function MarketWindow({ toVillageId, onClose }: { toVillageId?: string; onClose: () => void }) {
  const s = useSession();
  const nav = useNav();
  const v = s.state.villages[s.villageId]!;
  const sum = villageSummary(s.state, content, v);
  const mine = s.player.villageIds.filter((id) => id !== v.id);
  const [dest, setDest] = useState(toVillageId ?? mine[0] ?? "");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const load: Resources = {};
  for (const r of content.resourceIds) {
    const n = Math.max(0, Math.min(Math.floor(v.resources[r] ?? 0), Math.floor(Number(amounts[r]) || 0)));
    if (n > 0) load[r] = n;
  }
  const need = merchantsNeeded(s.state, content, v, load);
  const free = sum.merchants.total - sum.merchants.busy;
  const target = s.state.villages[dest];
  const destTile = target ? tileIndex(content, target.x, target.y) : null;
  const travel = destTile !== null ? marchMs(s.state, content, null, tileIndex(content, v.x, v.y), destTile, content.factions[s.player.factionId]!.merchant.speed) : null;
  const others = Object.values(s.state.villages).filter((x) => x.kind === "player" && x.ownerId !== s.active);
  return (
    <Modal title="Send goods" eyebrow={`Agora of ${v.name}`} onClose={onClose}>
      <label className="field">
        <span className="field__label">To</span>
        <select id="market-dest" value={dest} onChange={(e) => setDest(e.target.value)}>
          <option value="">Choose a town…</option>
          {mine.length > 0 && (
            <optgroup label="Your towns">
              {mine.map((id) => (
                <option key={id} value={id}>
                  {s.state.villages[id]!.name}
                </option>
              ))}
            </optgroup>
          )}
          {others.length > 0 && (
            <optgroup label="Other players">
              {others.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} ({s.state.players[x.ownerId]?.name}) ({x.x}|{x.y})
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <div className="market-rows">
        {content.resourceIds.map((r) => (
          <label key={r} className="market-row">
            <ResIcon id={r} size={22} />
            <input
              id={`market-${r}`}
              type="number"
              min={0}
              inputMode="numeric"
              value={amounts[r] ?? ""}
              placeholder="0"
              onChange={(e) => setAmounts((a) => ({ ...a, [r]: e.target.value }))}
            />
            <button type="button" className="link small" onClick={() => setAmounts((a) => ({ ...a, [r]: String(Math.floor(v.resources[r] ?? 0)) }))}>
              all {int(v.resources[r] ?? 0)}
            </button>
          </label>
        ))}
      </div>
      <p className={need > free ? "note note--warn" : "muted"}>
        {need} of {free} free merchants needed, {int(sum.merchants.capacity)} each.{travel !== null && ` The trip takes ${duration(travel)}.`}
      </p>
      <button
        className="btn btn--primary btn--wide"
        disabled={!target || need === 0 || need > free}
        onClick={() => {
          const r = s.run((g, t) => g.sendResources(s.active, v.id, dest, load, t), "Merchants are on their way.");
          if (r.ok) nav.close();
        }}
      >
        Send merchants
      </button>
    </Modal>
  );
}
