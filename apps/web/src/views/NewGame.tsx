import { useState } from "react";
import { content } from "../content";
import type { NewGameOptions } from "../session";
import { Band, UnitIcon, art } from "../ui";

const SPEEDS = [
  { v: 1, label: "×1", note: "a real-time world: fields take hours" },
  { v: 3, label: "×3", note: "brisk" },
  { v: 10, label: "×10", note: "an evening's game" },
  { v: 50, label: "×50", note: "fast" },
  { v: 250, label: "×250", note: "test everything in minutes" },
];

export function NewGame({ onStart }: { onStart: (opts: NewGameOptions) => void }) {
  const playable = content.factionList.filter((f) => f.playable);
  const [name, setName] = useState("Protis");
  // MASSALIA's own people first: the founder Protis was a Phocaean Greek.
  const [factionId, setFaction] = useState((playable.find((f) => f.id === "hellenes") ?? playable[0]!).id);
  const [speed, setSpeed] = useState(10);
  const [rivals, setRivals] = useState(5);
  const [raids, setRaids] = useState(true);
  return (
    <div className="newgame">
      <div className="newgame__bar">
        <img className="coin" src={art("lion")} alt="" width={44} height={44} />
        <span className="wordmark">Emporion</span>
      </div>
      <Band />
      <header className="newgame__head">
        <img className="newgame__banner" src={art("banner-harbor")} alt="" />
        <div className="newgame__plaque">
          <div className="eyebrow">A tile-map strategy world on MASSALIA's map · 300 BC</div>
          <h1 className="newgame__title">Found your house</h1>
          <p className="lede">
            Found a town on the coasts and hills of the western Mediterranean. Raise its fields and buildings, train an army, raid outlaw camps and the old cities,
            send settlers to new valleys, and take your rivals' colonies. Your hero is the head of your house: marry, raise heirs, and pass the sword down the
            generations.
          </p>
        </div>
      </header>
      <form
        className="newgame__form"
        onSubmit={(e) => {
          e.preventDefault();
          onStart({ playerName: name, factionId, speed, rivals, npcRaids: raids });
        }}
      >
        <label className="field">
          <span className="field__label">Your name</span>
          <input id="ng-name" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
        </label>
        <fieldset className="factions">
          <legend className="field__label">People</legend>
          {playable.map((f) => {
            const start = f.start ? content.towns[f.start.town]?.name : undefined;
            const showcase = f.units.filter((u) => u.icon).slice(0, 4);
            return (
              <label key={f.id} className={`faction${factionId === f.id ? " is-on" : ""}`} style={{ ["--faction" as string]: f.color ?? "#999" }}>
                <input type="radio" name="faction" value={f.id} checked={factionId === f.id} onChange={() => setFaction(f.id)} />
                <span className="faction__name">{f.name}</span>
                {start && <span className="faction__start">Start near {start}</span>}
                <span className="faction__desc">{f.description}</span>
                <span className="faction__units">
                  {showcase.map((u) => (
                    <UnitIcon key={u.id} id={u.id} size={38} />
                  ))}
                </span>
              </label>
            );
          })}
        </fieldset>
        <fieldset className="speeds">
          <legend className="field__label">World speed</legend>
          {SPEEDS.map((sp) => (
            <label key={sp.v} className={`speed${speed === sp.v ? " is-on" : ""}`}>
              <input type="radio" name="speed" value={sp.v} checked={speed === sp.v} onChange={() => setSpeed(sp.v)} />
              <span className="speed__label">{sp.label}</span>
              <span className="speed__note">{sp.note}</span>
            </label>
          ))}
        </fieldset>
        <div className="newgame__row">
          <label className="field">
            <span className="field__label">AI rivals: {rivals}</span>
            <input id="ng-rivals" type="range" min={0} max={12} value={rivals} onChange={(e) => setRivals(Number(e.target.value))} />
          </label>
          <label className="check">
            <input type="checkbox" checked={raids} onChange={(e) => setRaids(e.target.checked)} /> Outlaws raid careless towns
          </label>
        </div>
        <button className="btn btn--buy btn--hero" type="submit">
          Found your town
        </button>
        <p className="small muted">
          {content.map.width * content.map.height} tiles · {content.map.towns.length} historical cities · the game saves in this browser.
        </p>
      </form>
    </div>
  );
}
