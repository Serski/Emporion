import { useState } from "react";
import { content } from "../content";
import { goTo } from "../route";
import { Modal, factionName, useSession } from "../ui";

// Everyone playing on this screen. A second human makes hot-seat play
// possible, which is also the quickest way to test player-against-player rules.
export function PlayersWindow({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const [name, setName] = useState("");
  const [faction, setFaction] = useState("celts");
  const [confirm, setConfirm] = useState(false);
  const playable = content.factionList.filter((f) => f.playable);
  return (
    <Modal title="Players" eyebrow="On this screen" onClose={onClose}>
      <ul className="list">
        {s.humans.map((id) => {
          const p = s.state.players[id]!;
          return (
            <li key={id} className={`list__row${id === s.active ? " is-current" : ""}`}>
              <span>
                <strong>{p.name}</strong> <span className="muted">· {factionName(p.factionId)} · {p.villageIds.length} town{p.villageIds.length === 1 ? "" : "s"}</span>
              </span>
              {id === s.active ? (
                <span className="tag">playing</span>
              ) : (
                <button className="btn btn--small" onClick={() => s.switchPlayer(id)}>
                  Play as
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          s.addHuman(name, faction);
          setName("");
        }}
      >
        <div className="eyebrow">Add a player (hot-seat)</div>
        <div className="inline-form">
          <input id="new-player-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="New player's name" />
          <select id="new-player-faction" value={faction} onChange={(e) => setFaction(e.target.value)} aria-label="Faction">
            {playable.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <button className="btn" type="submit">
            Add
          </button>
        </div>
      </form>
      <div className="danger-zone">
        <p className="small muted">The game saves itself in this browser every few seconds.</p>
        {confirm ? (
          <div className="inline-form">
            <span>Leave this world for a new one? It goes into the hall of fame.</span>
            <button
              className="btn btn--danger"
              onClick={() => {
                onClose();
                goTo("/create");
              }}
            >
              Found a new house
            </button>
            <button className="btn btn--ghost" onClick={() => setConfirm(false)}>
              Keep playing
            </button>
          </div>
        ) : (
          <div className="actions">
            <button className="btn btn--ghost" onClick={() => goTo("/lobby")}>
              To the lobby
            </button>
            <button className="btn btn--ghost" onClick={() => setConfirm(true)}>
              New world…
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
