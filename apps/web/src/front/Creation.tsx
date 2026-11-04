import { useEffect, useMemo, useState } from "react";
import { townPolity } from "@emporion/engine";
import { content } from "../content";
import type { NewGameOptions } from "../session";
import { goTo } from "../route";
import { BrandLockup, UnitIcon, art, portraitUrl } from "../ui";
import "./front.css";

// ---------------------------------------------------------------------------
// Founding a house, in MASSALIA's character-creation frame: a step at a time
// with the stepper bar, choice cards and the summary card beside them. The
// steps are EMPORION's: the people (MASSALIA's calling and House have no
// counterpart here), the founder's age and face (MASSALIA's step 3 as it is),
// and the world to found it in.
// ---------------------------------------------------------------------------

const STEPS = ["Choose your people", "Choose your age & face", "Choose your world"] as const;

const SPEEDS = [
  { v: 1, label: "×1", note: "A real-time world: fields take hours." },
  { v: 3, label: "×3", note: "Brisk." },
  { v: 10, label: "×10", note: "An evening's game." },
  { v: 50, label: "×50", note: "Fast." },
  { v: 250, label: "×250", note: "Test everything in minutes." },
];

const STAT_NAMES: Record<string, string> = Object.fromEntries(content.massalia.profile.stats.map((s) => [s.id, s.name]));

function bonusLabel(bonus: Record<string, number> | undefined): string {
  const parts = Object.entries(bonus ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `+${v} ${STAT_NAMES[k] ?? k}`);
  return parts.join(", ");
}

// A face as it looks at an age (20: young, 30: prime), as MASSALIA's signup shows it.
function faceAt(face: string, age: number): string {
  let stage = content.family.portraitStages[0]!.stage;
  for (const s of content.family.portraitStages) if (age >= s.fromAge) stage = s.stage;
  return `${face}-${stage}`;
}

function crestOf(factionId: string): string | null {
  const town = content.factions[factionId]?.start?.town;
  const polity = townPolity(content, town);
  return polity ? art(`crests/${polity}`) : null;
}

// MASSALIA's own people first: the founder of Massalia was a Phocaean Greek.
const PEOPLES = content.factionList
  .filter((f) => f.playable)
  .sort((a, b) => Number(b.start?.town === "massalia") - Number(a.start?.town === "massalia"));

export function Creation({ worldName, replacing, onComplete }: { worldName: string; replacing: boolean; onComplete: (opts: NewGameOptions) => void }) {
  const playable = PEOPLES;
  const ages = content.family.head.ageOptions;
  const [step, setStep] = useState(1);
  const [factionId, setFactionId] = useState("");
  const [age, setAge] = useState<number | null>(null);
  const [face, setFace] = useState("");
  const [name, setName] = useState("");
  const [speed, setSpeed] = useState(10);
  const [rivals, setRivals] = useState(5);
  const [raids, setRaids] = useState(true);
  const [details, setDetails] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [step]);

  const faction = content.factions[factionId];
  const ageOption = ages.find((o) => o.age === age);
  const canContinue = (step === 1 && !!faction) || (step === 2 && !!ageOption && !!face && !!name.trim()) || step === 3;

  const found = () => {
    if (!faction || !ageOption || !face || !name.trim()) return;
    onComplete({ worldName, playerName: name.trim(), factionId: faction.id, startAge: ageOption.age, portrait: face, speed, rivals, npcRaids: raids });
  };

  return (
    <main className="creation-shell">
      <nav className="creation-nav" aria-label="Founding a house">
        <BrandLockup onClick={() => goTo("/")} />
        <button className="creation-ghost-button" type="button" onClick={() => goTo(replacing ? "/lobby" : "/")}>
          Exit
        </button>
      </nav>
      <section className="creation-layout" aria-labelledby="creation-title">
        <section className="creation-panel">
          <p className="section-eyebrow">
            Found your house · Step {step} of {STEPS.length}
          </p>
          <h1 id="creation-title">{STEPS[step - 1]}</h1>
          <div className="creation-stepper" aria-label="Progress" style={{ gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))` }}>
            {STEPS.map((label, i) => (
              <span className={i + 1 <= step ? "active" : ""} key={label} aria-label={`Step ${i + 1}: ${label}`} />
            ))}
          </div>

          {step === 1 && (
            <div className="creation-people-grid">
              {playable.map((f) => {
                const crest = crestOf(f.id);
                const figure = f.units.find((u) => u.icon && !u.role) ?? f.units[0]!;
                const town = f.start ? content.towns[f.start.town]?.name : undefined;
                const bonus = bonusLabel(content.massalia.profile.start[f.id]);
                return (
                  <article key={f.id} className={`creation-choice-card${factionId === f.id ? " selected" : ""}`}>
                    {factionId === f.id && (
                      <span className="creation-check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                    <button className="creation-card-main" type="button" aria-pressed={factionId === f.id} aria-label={`Lead the ${f.name}`} onClick={() => setFactionId(f.id)}>
                      <span className="creation-figure creation-figure--people">
                        <UnitIcon id={figure.id} size={168} />
                        {crest && <img className="creation-people-crest" src={crest} alt="" width={64} height={64} />}
                      </span>
                      <span className="creation-card-copy">
                        <strong>{f.name}</strong>
                        <span>{town ? `Start near ${town}` : "Start anywhere"}</span>
                      </span>
                      <span className="creation-card-about">{f.description}</span>
                      {bonus && <span className="creation-age-bonus">Head start: {bonus}</span>}
                    </button>
                    <button className="creation-details-link" type="button" onClick={() => setDetails(f.id)}>
                      ⓘ View details
                    </button>
                  </article>
                );
              })}
            </div>
          )}

          {step === 2 && (
            <div className="creation-avatar-step">
              <div className="creation-age-toggle" role="group" aria-label="Choose your starting age">
                {ages.map((o) => (
                  <button
                    key={o.age}
                    type="button"
                    className={`creation-age-option${age === o.age ? " selected" : ""}`}
                    aria-pressed={age === o.age}
                    onClick={() => {
                      setAge(o.age);
                      setFace("");
                    }}
                  >
                    <strong>{o.label}</strong>
                    <span className="creation-age-note">{o.note}</span>
                    {bonusLabel(o.startBonus) && <span className="creation-age-bonus">Head start: {bonusLabel(o.startBonus)}</span>}
                  </button>
                ))}
              </div>
              {ageOption ? (
                <div className="creation-face-grid" aria-label="Choose your face">
                  {ageOption.faces.map((f, i) => (
                    <button key={f} type="button" className={`creation-face${face === f ? " selected" : ""}`} aria-pressed={face === f} aria-label={`Choose face ${i + 1}`} onClick={() => setFace(f)}>
                      <img src={portraitUrl(faceAt(f, ageOption.age))} alt="" width={168} height={168} loading="lazy" decoding="async" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="creation-note">Pick an age to see its faces.</p>
              )}
              <div className="creation-name-fields">
                <label>
                  <span>Name</span>
                  <input id="creation-name" type="text" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="Protis" />
                </label>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="creation-world-step">
              <fieldset className="creation-speeds">
                <legend className="creation-legend">World speed</legend>
                {SPEEDS.map((sp) => (
                  <button key={sp.v} type="button" className={`creation-age-option${speed === sp.v ? " selected" : ""}`} aria-pressed={speed === sp.v} onClick={() => setSpeed(sp.v)}>
                    <strong>{sp.label}</strong>
                    <span className="creation-age-note">{sp.note}</span>
                  </button>
                ))}
              </fieldset>
              <div className="creation-name-fields">
                <label>
                  <span>AI rivals: {rivals}</span>
                  <input id="creation-rivals" className="creation-range" type="range" min={0} max={12} value={rivals} onChange={(e) => setRivals(Number(e.target.value))} />
                </label>
                <label className="creation-consent">
                  <input type="checkbox" checked={raids} onChange={(e) => setRaids(e.target.checked)} />
                  <span>Outlaws raid careless towns.</span>
                </label>
              </div>
              <p className="creation-note">
                {replacing
                  ? "Your current world goes into the hall of fame, and this one takes its place in this browser."
                  : "The world runs in this browser and saves there. Nothing to download."}
              </p>
            </div>
          )}

          <footer className="creation-footer">
            <button className="creation-ghost-button" type="button" disabled={step === 1} onClick={() => setStep((n) => Math.max(1, n - 1))}>
              ← Back
            </button>
            {step < STEPS.length ? (
              <button className="primary-cta" type="button" disabled={!canContinue} onClick={() => canContinue && setStep((n) => n + 1)}>
                Continue →
              </button>
            ) : (
              <button className="primary-cta" type="button" onClick={found}>
                Found your house
              </button>
            )}
          </footer>
        </section>

        <aside className="creation-summary" aria-label="You, in the world">
          <p className="section-eyebrow">You, in the world</p>
          <div className="summary-portrait">
            <span className={`summary-ring${face && age ? " has-portrait" : ""}`} aria-hidden="true">
              {face && age ? <img src={portraitUrl(faceAt(face, age))} alt="" width={86} height={86} /> : (name.trim()[0] ?? "?")}
            </span>
          </div>
          <h2>{name.trim() || "Unnamed"}</h2>
          <p>{faction ? faction.name : "people"}</p>
          <dl>
            <div>
              <dt>Origin</dt>
              <dd>{faction?.start ? `Near ${content.towns[faction.start.town]?.name}` : "— not yet —"}</dd>
            </div>
            <div>
              <dt>House</dt>
              <dd>{name.trim() ? `House of ${name.trim()}` : "— not yet —"}</dd>
            </div>
            <div>
              <dt>Age</dt>
              <dd>{ageOption ? ageOption.label : "— not yet —"}</dd>
            </div>
            <div>
              <dt>World</dt>
              <dd>
                {worldName} · ×{speed}
              </dd>
            </div>
          </dl>
        </aside>
      </section>

      {details && <PeopleSheet id={details} onClose={() => setDetails(null)} onChoose={() => (setFactionId(details), setDetails(null))} />}
    </main>
  );
}

function PeopleSheet({ id, onClose, onChoose }: { id: string; onClose: () => void; onChoose: () => void }) {
  const f = content.factions[id]!;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const units = useMemo(() => f.units.filter((u) => u.building.length > 0), [f]);
  return (
    <div className="creation-sheet-backdrop" onMouseDown={onClose}>
      <section className="creation-sheet" role="dialog" aria-modal="true" aria-labelledby="creation-sheet-title" onMouseDown={(e) => e.stopPropagation()}>
        <span className="creation-sheet-handle" aria-hidden="true" />
        <div className="creation-sheet-body">
          <p className="section-eyebrow">People</p>
          <h2 id="creation-sheet-title">{f.name}</h2>
          <p>{f.description}</p>
          <dl className="creation-facts">
            <div>
              <dt>Home</dt>
              <dd>{f.start ? content.towns[f.start.town]?.name : "Anywhere"}</dd>
            </div>
            <div>
              <dt>Walls</dt>
              <dd>
                {f.wall.name ?? "Walls"} · +{(f.wall.bonusPerLevel * 100).toFixed(1)}% a level
              </dd>
            </div>
            <div>
              <dt>Merchants</dt>
              <dd>
                carry {f.merchant.capacity} · {f.merchant.speed} hexes an hour
              </dd>
            </div>
            <div>
              <dt>Head start</dt>
              <dd>{bonusLabel(content.massalia.profile.start[f.id]) || "None"}</dd>
            </div>
          </dl>
          <ul className="creation-units">
            {units.map((u) => (
              <li key={u.id}>
                <UnitIcon id={u.id} size={44} />
                <span>
                  <strong>{u.name}</strong>
                  <small>
                    attack {u.attack} · defence {u.defenseInfantry}/{u.defenseCavalry} · speed {u.speed}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <footer className="creation-sheet-footer">
          <button className="creation-ghost-button" type="button" onClick={onClose}>
            Close
          </button>
          <button className="primary-cta creation-sheet-primary" type="button" onClick={onChoose}>
            Lead the {f.name}
          </button>
        </footer>
      </section>
    </div>
  );
}
