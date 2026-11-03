import { useState } from "react";
import { kingdomAtTile, kingdomStandings, population, tileIndex, tributeWaiting, firstBuildingWith } from "@emporion/engine";
import { content } from "../content";
import { int, pct } from "../format";
import { ResIcon, useSession } from "../ui";

export function KingdomView() {
  const s = useSession();
  const [name, setName] = useState("");
  const [leaving, setLeaving] = useState(false);
  const now = s.now();
  const k = s.player.kingdomId ? s.state.kingdoms[s.player.kingdomId] : undefined;
  const cfg = content.kingdoms;
  const capital = s.player.capitalId ? s.state.villages[s.player.capitalId] : undefined;
  const standing = k ? kingdomStandings(s.state, content).find((x) => x.id === k.id) : undefined;
  const territory = capital ? kingdomAtTile(s.state, content, tileIndex(content, capital.x, capital.y)) : null;
  const here = territory ? s.state.kingdoms[territory] : undefined;
  const isKing = k?.kingId === s.active;
  const waiting = k && isKing ? tributeWaiting(s.state, content, k, now) : null;

  if (!cfg.enabled) return <p className="empty">Kingdoms are off in this world.</p>;

  return (
    <div className="kingdom-view">
      <div className="view-head">
        <div>
          <div className="eyebrow">{k ? (isKing ? "Your kingdom" : "You are a governor of") : "You serve no king"}</div>
          <h1 className="view-title">{k ? k.name : "Kingdoms"}</h1>
        </div>
      </div>
      {!k && (
        <>
          <section className="subpanel">
            <h3 className="subpanel__title">Found a kingdom</h3>
            <p>
              A king needs a capital of {cfg.found.minPopulation} people with a Treasury. Your towns then project influence over the map; governors whose capitals lie inside it can join, sending {pct(cfg.tribute.share)} of
              their production as tribute and earning +{pct(cfg.memberProductionBonus)} in return.
            </p>
            {capital && (
              <p className="small muted">
                Your capital: {int(population(content, capital))} people, Treasury level {firstBuildingWith(content, capital, (d) => !!d.effects.treasures)?.level ?? 0}.
              </p>
            )}
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                s.run((g, t) => g.foundKingdom(s.active, name, t), "Long live the king.");
              }}
            >
              <input id="kingdom-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name of the kingdom" aria-label="Name of the kingdom" />
              <button className="btn btn--primary" type="submit">
                Found
              </button>
            </form>
          </section>
          <section className="subpanel">
            <h3 className="subpanel__title">Join a kingdom</h3>
            {here ? (
              <div className="inline-form">
                <span>
                  Your capital lies in the territory of <strong>{here.name}</strong>, ruled by {s.state.players[here.kingId]?.name}.
                </span>
                <button className="btn btn--primary" onClick={() => s.run((g, t) => g.joinKingdom(s.active, here.id, t), `You now serve ${here.name}.`)}>
                  Swear allegiance
                </button>
              </div>
            ) : (
              <p className="muted">No kingdom's influence reaches your capital.</p>
            )}
          </section>
        </>
      )}
      {k && standing && (
        <>
          <div className="stats-row">
            <div className="stat">
              <span className="stat__label">King</span>
              <span className="stat__value">{standing.kingName}</span>
            </div>
            <div className="stat">
              <span className="stat__label">Governors</span>
              <span className="stat__value">{standing.members}</span>
            </div>
            <div className="stat">
              <span className="stat__label">Treasures</span>
              <span className="stat__value">{standing.treasures}</span>
            </div>
            <div className="stat">
              <span className="stat__label">Victory points</span>
              <span className="stat__value">{int(standing.victoryPoints)}</span>
            </div>
          </div>
          {isKing && waiting && (
            <section className="subpanel">
              <h3 className="subpanel__title">Tribute</h3>
              <div className="loot">
                {content.resourceIds.map((r) => (
                  <span key={r} className="prod-chip">
                    <ResIcon id={r} size={16} /> {int(waiting[r] ?? 0)}
                  </span>
                ))}
              </div>
              <button className="btn btn--primary" onClick={() => s.run((g, t) => g.collectTribute(s.active, t), "Tribute brought to the capital.")}>
                Collect into {capital?.name}
              </button>
            </section>
          )}
          <section className="subpanel">
            <h3 className="subpanel__title">Members</h3>
            <ul className="bullets">
              {[k.kingId, ...k.members].map((id) => (
                <li key={id}>
                  {s.state.players[id]?.name} {id === k.kingId ? "(king)" : "(governor)"}
                </li>
              ))}
            </ul>
          </section>
          {leaving ? (
            <div className="inline-form">
              <span>{isKing ? "Abdicate and dissolve the kingdom?" : "Leave the kingdom? Uncollected tribute returns to your stores."}</span>
              <button className="btn btn--danger" onClick={() => s.run((g, t) => g.leaveKingdom(s.active, t), isKing ? "The kingdom is dissolved." : "You left the kingdom.")}>
                {isKing ? "Abdicate" : "Leave"}
              </button>
              <button className="btn btn--ghost" onClick={() => setLeaving(false)}>
                Stay
              </button>
            </div>
          ) : (
            <button className="btn btn--ghost" onClick={() => setLeaving(true)}>
              {isKing ? "Abdicate…" : "Leave the kingdom…"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
