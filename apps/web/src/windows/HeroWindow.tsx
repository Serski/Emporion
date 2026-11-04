import { useState } from "react";
import { dayView, familyView, heroView, type HeroPoints, type PersonView } from "@emporion/engine";
import { content } from "../content";
import { at, duration, int, pct } from "../format";
import { heroStatus } from "../hud";
import { useNav, type HeroTab } from "../nav";
import { Bar, Cost, Countdown, Modal, Portrait, ResIcon, Stat, Tabs, art, useSession } from "../ui";
import { DayTab, HouseholdTab, ProfileTab } from "./ProfileTabs";

const ATTRS: { id: keyof HeroPoints; label: string; explain: (n: number) => string }[] = [
  { id: "strength", label: "Fighting strength", explain: (n) => `${int(content.hero.strength.base + content.hero.strength.perPoint * n)} attack and defence of their own` },
  { id: "offense", label: "Offence bonus", explain: (n) => `+${pct(content.hero.offensePerPoint * n)} attack for the army they lead` },
  { id: "defense", label: "Defence bonus", explain: (n) => `+${pct(content.hero.defensePerPoint * n)} defence for the troops they stand with` },
  { id: "production", label: "Resources", explain: (n) => `${int(content.hero.production.allPerPoint * n)} of each, or ${int(content.hero.production.singlePerPoint * n)} of one, an hour at speed 1` },
];

const KIND: Record<string, string> = { founder: "Founder", blood: "Blood heir", adopted: "Adopted heir", regent: "Regent", forced: "Adopted by the house" };

// The Profile: MASSALIA's character sheet, the day, the household, then the
// hero (Travian Kingdoms' hero), the family and the lineage.
export function HeroWindow({ tab: initial, onClose }: { tab?: HeroTab; onClose: () => void }) {
  const s = useSession();
  const [tab, setTab] = useState<HeroTab>(initial ?? "profile");
  const now = s.now();
  const h = heroView(s.state, content, s.player, now);
  const fam = familyView(s.state, content, s.player, now);
  const day = dayView(s.state, content, s.player, now);
  if (!h) return null;
  const titles: Record<HeroTab, string> = { profile: h.name, day: "Your day", household: fam?.name ?? "Household", hero: h.name, family: fam?.name ?? "Family", lineage: fam?.name ?? "Lineage" };
  const eyebrows: Record<HeroTab, string> = {
    profile: `Profile · ${fam?.name ?? s.player.name}`,
    day: `${fam?.date ?? ""} · one day a season`,
    household: "Purse, people, crafts and fleet",
    hero: `Hero · ${heroStatus(h.status)}`,
    family: `${fam?.date ?? ""} · generation ${fam?.generation ?? 1}`,
    lineage: `${fam?.date ?? ""} · generation ${fam?.generation ?? 1}`,
  };
  const banners: Partial<Record<HeroTab, string>> = { profile: art("banner-court"), day: art("banner-dionysia"), household: art("banner-ledger"), family: art("banner-family"), lineage: art("banner-court") };
  return (
    <Modal title={titles[tab]} eyebrow={eyebrows[tab]} onClose={onClose} wide banner={banners[tab]}>
      <Tabs
        tabs={[
          { id: "profile", label: "Profile" },
          { id: "day", label: "Your day", badge: day && !day.withdrawn && day.picked < day.picksPerSeason ? 1 : undefined },
          { id: "household", label: "Household" },
          { id: "hero", label: "Hero", badge: h.unspent || undefined },
          { id: "family", label: "Family", badge: fam && !fam.spouse && fam.candidates.length ? 1 : undefined },
          { id: "lineage", label: "Lineage" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "profile" && <ProfileTab />}
      {tab === "day" && <DayTab />}
      {tab === "household" && <HouseholdTab />}
      {tab === "hero" && <HeroTabBody />}
      {tab === "family" && <FamilyTabBody />}
      {tab === "lineage" && <LineageTabBody />}
    </Modal>
  );
}

function HeroTabBody() {
  const s = useSession();
  const nav = useNav();
  const now = s.now();
  const h = heroView(s.state, content, s.player, now)!;
  const fam = familyView(s.state, content, s.player, now);
  const [add, setAdd] = useState<Partial<HeroPoints>>({});
  const home = s.state.villages[h.homeVillageId];
  const pending = Object.values(add).reduce((a, b) => a + (b ?? 0), 0);
  return (
    <>
      <div className="hero-sheet">
        <Portrait stem={h.portrait} size={150} dim={!h.alive} />
        <div className="hero-sheet__facts">
          <div className="stats-row">
            <Stat label="Level">{h.level}</Stat>
            <Stat label="Age" note={h.lifeStage ?? undefined}>
              {h.age ?? "—"}
            </Stat>
            <Stat label="Health">{h.alive ? `${h.health}%` : "—"}</Stat>
            <Stat label="Experience">
              {int(h.xp)}
              <small>/{int(h.xpNext)}</small>
            </Stat>
          </div>
          <div className="hero-bars">
            <label>
              <span className="small muted">Experience to level {h.level + 1}</span>
              <Bar value={h.xp} max={h.xpNext} />
            </label>
            <label>
              <span className="small muted">Health, +{content.hero.healthRegenPerDay}% a day</span>
              <Bar value={h.health} max={100} tone={h.health < 30 ? "danger" : "good"} />
            </label>
          </div>
          {fam && (
            <p className="small">
              Head of <strong>{fam.name}</strong>, home in {home?.name}.
              {fam.mods.strength < 1 && ` Age has cost ${pct(1 - fam.mods.strength)} of their strength.`}
              {fam.mods.defenseBonus > 0 && ` ${fam.spouse?.name}'s sternness adds ${pct(fam.mods.defenseBonus)} defence.`}
              {fam.mods.xpBonus > 0 && ` ${fam.spouse?.name}'s learning adds ${pct(fam.mods.xpBonus)} experience.`}
              {fam.mods.cultureBonus > 0 && ` ${fam.spouse?.name}'s devotion adds ${pct(fam.mods.cultureBonus)} culture at home.`}
            </p>
          )}
        </div>
      </div>
      {h.status === "dead" && (
        <section className="subpanel">
          <h3 className="subpanel__title">Fallen in battle</h3>
          <p>
            Revive in {home?.name} in {duration(h.reviveMs)}.
          </p>
          <Cost cost={h.reviveCost} have={home?.resources} />
          <button className="btn btn--buy" onClick={() => s.run((g, t) => g.reviveHero(s.active, t), "The hero is being revived.")}>
            Revive
          </button>
        </section>
      )}
      {h.status === "reviving" && h.reviveAt !== null && (
        <p className="note">
          Back on their feet in <Countdown to={h.reviveAt} now={now} />.
        </p>
      )}
      <section className="subpanel">
        <div className="subpanel__head">
          <h3 className="subpanel__title">Attributes</h3>
          <span className="tag">{h.unspent - pending} points to spend</span>
        </div>
        <ul className="attrs">
          {ATTRS.map((a) => {
            const extra = add[a.id] ?? 0;
            return (
              <li key={a.id} className="attr">
                <div>
                  <div className="attr__name">
                    {a.label} <span className="attr__pts">{h.points[a.id] + extra}</span>
                  </div>
                  <div className="small muted">{a.explain(h.points[a.id] + extra)}</div>
                </div>
                <div className="attr__btns">
                  <button className="sq-btn" disabled={extra <= 0} onClick={() => setAdd((x) => ({ ...x, [a.id]: extra - 1 }))} aria-label={`One point less in ${a.label}`}>
                    −
                  </button>
                  <button className="sq-btn" disabled={h.unspent - pending <= 0} onClick={() => setAdd((x) => ({ ...x, [a.id]: extra + 1 }))} aria-label={`One point more in ${a.label}`}>
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <button
          className="btn btn--buy"
          disabled={pending === 0}
          onClick={() => {
            const r = s.run((g, t) => g.assignHeroPoints(s.active, add, t), "Points assigned.");
            if (r.ok) setAdd({});
          }}
        >
          Confirm points
        </button>
      </section>
      <section className="subpanel">
        <h3 className="subpanel__title">Production</h3>
        <div className="subtabs">
          <button className={h.productionResource === "all" ? "is-on" : undefined} onClick={() => s.run((g, t) => g.setHeroProduction(s.active, "all", t))}>
            All four
          </button>
          {content.resourceIds.map((r) => (
            <button key={r} className={h.productionResource === r ? "is-on" : undefined} onClick={() => s.run((g, t) => g.setHeroProduction(s.active, r, t))}>
              <ResIcon id={r} size={16} /> {content.resources.find((x) => x.id === r)?.name}
            </button>
          ))}
        </div>
      </section>
      <section className="subpanel">
        <h3 className="subpanel__title">In the field</h3>
        <ul className="bullets">
          <li>Tick "Hero goes with them" when sending troops. Alone, the hero marches at speed {content.hero.speed}.</li>
          <li>Each fallen enemy is worth its wheat upkeep in experience; every level brings {content.hero.pointsPerLevel} points.</li>
          <li>Win an attack on an oasis inside your town's territory with the hero in the army to annex it (needs a Heroon).</li>
          <li>A hero who falls in battle can be revived. Old age cannot be undone: then the heir takes up the sword.</li>
        </ul>
        {h.status === "stationed" && s.player.hero?.where?.startsWith("v:") && (
          <button className="btn btn--sell" onClick={() => s.run((g, t) => g.moveHeroHome(s.active, s.player.hero!.where!.slice(2), t), "New home town.")}>
            Make {s.state.villages[s.player.hero!.where!.slice(2)]?.name} the hero's home
          </button>
        )}
        <button className="btn btn--ghost" onClick={() => nav.go("map")}>
          Find oases on the map
        </button>
      </section>
    </>
  );
}

function PersonCard({ p, role, children }: { p: PersonView; role: string; children?: React.ReactNode }) {
  return (
    <div className={`person${p.alive ? "" : " is-dead"}`}>
      <Portrait stem={p.portrait} size={76} dim={!p.alive} />
      <div className="person__text">
        <div className="eyebrow">{role}</div>
        <div className="person__name">{p.name}</div>
        <div className="person__meta">
          {p.alive ? `${p.age} years · ${p.stage}` : `Died ${p.cause ? `of ${p.cause}` : ""} at ${p.age}`}
        </div>
        {p.trait && (
          <div className="person__traits">
            <span className="tchip" title={p.trait.description}>
              {p.trait.name}
            </span>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function FamilyTabBody() {
  const s = useSession();
  const now = s.now();
  const fam = familyView(s.state, content, s.player, now);
  const [naming, setNaming] = useState<{ id: string; name: string } | null>(null);
  if (!fam) return <p className="empty">This world has no families.</p>;
  const sons = fam.children.filter((c) => c.alive && c.sex === "male").length;
  const succ = fam.succession;
  const succText = !succ
    ? ""
    : succ.kind === "blood"
      ? `${succ.heir?.name}, the eldest son of age, inherits with ${pct(succ.carryover)} of the hero's experience.`
      : succ.kind === "adopted"
        ? `${succ.heir?.name}, the adopted heir, inherits with ${pct(succ.carryover)} of the experience.`
        : succ.kind === "regent"
          ? `${succ.heir?.name} is too young: a regent would hold the house (${pct(succ.carryover)} of the experience) until he is ${content.family.comingOfAge}.`
          : `No son or heir: the house would adopt a stranger (${pct(succ.carryover)} of the experience). Marry, or adopt an heir.`;
  return (
    <>
      <div className="family-grid">
        <PersonCard p={fam.head} role={`Head of the house · ${KIND[fam.head.kind] ?? fam.head.kind}`}>
          <p className="person__note">{fam.head.deathAgeHint}</p>
        </PersonCard>
        {fam.spouse ? (
          <PersonCard p={fam.spouse} role="Wife">
            <p className="person__note">Married {at(fam.spouse.marriedAt, s.state.settings.startedAt)}</p>
          </PersonCard>
        ) : fam.widowed ? (
          <PersonCard p={fam.widowed} role="Late wife" />
        ) : (
          <div className="person person--empty">
            <div className="eyebrow">Wife</div>
            <p className="muted">{fam.head.name} is unwed. Choose a match below.</p>
          </div>
        )}
      </div>
      <p className="note">
        <strong>Succession.</strong> {succText}
      </p>
      {fam.regentFor && (
        <p className="note">
          {fam.head.name} rules as regent for {fam.regentFor.name}, now {fam.regentFor.age}.
        </p>
      )}

      <section className="subpanel">
        <div className="subpanel__head">
          <h3 className="subpanel__title">Children</h3>
          <span className="tag">
            {fam.children.length} of {content.family.children.max}
          </span>
        </div>
        {fam.children.length === 0 ? (
          <p className="muted">
            {fam.spouse ? "No children yet. Each year a wife between 18 and 35 may bear a child." : "Children need a wife."}
          </p>
        ) : (
          <div className="children">
            {fam.children.map((c) => (
              <PersonCard key={c.id} p={c} role={c.sex === "male" ? (c.ofAge ? "Son · may inherit" : "Son") : "Daughter"}>
                {c.alive &&
                  (naming?.id === c.id ? (
                    <form
                      className="inline-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        s.run((g, t) => g.nameChild(s.active, c.id, naming.name, t), "Renamed.");
                        setNaming(null);
                      }}
                    >
                      <input id={`child-${c.id}`} value={naming.name} maxLength={24} onChange={(e) => setNaming({ id: c.id, name: e.target.value })} aria-label="Child's name" />
                      <button className="btn btn--small btn--sell" type="submit">
                        Name
                      </button>
                    </form>
                  ) : (
                    <button className="link small" onClick={() => setNaming({ id: c.id, name: c.name })}>
                      Rename
                    </button>
                  ))}
              </PersonCard>
            ))}
          </div>
        )}
      </section>

      {!fam.spouse && fam.candidates.length > 0 && (
        <section className="subpanel">
          <div className="subpanel__head">
            <h3 className="subpanel__title">Matches this year</h3>
            <span className="tag">new matches each year</span>
          </div>
          <div className="children">
            {fam.candidates.map((c) => (
              <PersonCard key={c.id} p={c} role="Bride">
                <p className="person__note">{c.trait ? c.trait.description : "No dowry, no omens."}</p>
                <button className="btn btn--buy btn--small" onClick={() => s.run((g, t) => g.marry(s.active, c.id, t), `${fam.head.name} marries ${c.name}.`)}>
                  Marry
                </button>
              </PersonCard>
            ))}
          </div>
        </section>
      )}

      {(fam.adoptedHeir || fam.adoptees.length > 0) && (
        <section className="subpanel">
          <h3 className="subpanel__title">Adoption</h3>
          {fam.adoptedHeir ? (
            <PersonCard p={fam.adoptedHeir} role="Adopted heir" />
          ) : (
            <>
              <p className="small muted">
                {sons === 0 ? "The house has no son. An adopted heir inherits before any regent or stranger." : ""}
              </p>
              <div className="children">
                {fam.adoptees.map((c) => (
                  <PersonCard key={c.id} p={c} role="Candidate heir">
                    <button className="btn btn--sell btn--small" onClick={() => s.run((g, t) => g.adopt(s.active, c.id, t), `${c.name} is adopted as heir.`)}>
                      Adopt
                    </button>
                  </PersonCard>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {fam.kin.length > 0 && (
        <section className="subpanel">
          <h3 className="subpanel__title">Kin</h3>
          <div className="kin">
            {fam.kin.map((k) => (
              <span key={k.id} className="kin__item">
                <Portrait stem={k.portrait} size={40} />
                <span>
                  {k.name} <span className="muted small">{k.age}</span>
                </span>
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="subpanel">
        <h3 className="subpanel__title">Chronicle</h3>
        <ul className="chronicle">
          {fam.chronicle.map((c, i) => (
            <li key={i}>
              <span className="chronicle__date">{at(c.at, s.state.settings.startedAt)}</span>
              {c.text}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function LineageTabBody() {
  const s = useSession();
  const now = s.now();
  const fam = familyView(s.state, content, s.player, now);
  if (!fam) return <p className="empty">This world has no families.</p>;
  return (
    <>
      <p className="lede">
        {fam.name}, in its {fam.generation === 1 ? "first" : `${fam.generation}th`} generation. Each head who dies passes the hero to the next.
      </p>
      <ol className="lineage">
        <li className="lineage__row is-current">
          <Portrait stem={fam.head.portrait} size={56} />
          <div>
            <div className="person__name">{fam.head.name}</div>
            <div className="person__meta">
              {KIND[fam.head.kind] ?? fam.head.kind} · head since {at(fam.head.since, s.state.settings.startedAt)} · now {fam.head.age}
            </div>
          </div>
        </li>
        {[...fam.lineage].reverse().map((l, i) => (
          <li key={i} className="lineage__row">
            <Portrait stem={`${l.portrait}-old`} size={56} dim />
            <div>
              <div className="person__name">{l.name}</div>
              <div className="person__meta">
                {KIND[l.kind] ?? l.kind} · {at(l.from, s.state.settings.startedAt)} to {at(l.to, s.state.settings.startedAt)} · {l.cause} · hero level {l.level}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
