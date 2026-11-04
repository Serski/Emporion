import { content } from "../content";
import { goGame, goTo } from "../route";
import { BrandLockup, art, backdrop } from "../ui";
import "./front.css";

// The front page, laid out as MASSALIA's: the nav with the lion, one centred
// hero over the harbour painting with the call to play and three figures,
// the atlas, a closing call and the footer. A returning player (a save in
// this browser) sees Lobby and Continue playing instead.
export function Landing({ returning }: { returning: boolean }) {
  const peoples = content.factionList.filter((f) => f.playable).length;
  const start = () => goTo("/create");
  const play = () => goGame();
  return (
    <main className="landing-shell">
      <section className="landing-hero" aria-label="Emporion">
        <div className="landing-hero__art" style={backdrop(art("front"))} aria-hidden="true" />
        <nav className="landing-nav" aria-label="Main">
          <BrandLockup onClick={() => goTo("/")} />
          <div className="nav-actions">
            <button className="nav-button nav-login" type="button" onClick={() => goTo("/lobby")}>
              Lobby
            </button>
            <button className="nav-button nav-signup" type="button" onClick={returning ? play : start}>
              {returning ? "Continue playing" : "Start The Game"}
            </button>
          </div>
        </nav>

        <section className="hero-content" aria-label="Emporion overview">
          <div className="hero-copy">
            <p className="hero-eyebrow">
              <span className="live-pulse" aria-hidden="true" />
              Free Browser Strategy Game
            </p>
            <p className="hero-lead">300 BC · The Western Sea</p>
            <h1>Emporion</h1>
            <p className="hero-logline">
              Found a town on the coasts and hills of the western sea, between Rome, Carthage and the Celtic peoples. Raise its fields and buildings, train an
              army and a fleet, raid the old cities and plant colonies in new valleys. Your hero heads a house that trades at the agora, marries, plots against its
              rivals and passes the sword down the generations.
            </p>
            <div className="hero-actions">
              <button className="primary-cta" type="button" onClick={returning ? play : start}>
                {returning ? "Continue playing" : "Start The Game"}
              </button>
              <p className="cta-note">No download. Play free in your browser.</p>
            </div>
            <dl className="stat-row" aria-label="The world">
              <div>
                <dt>Peoples to lead</dt>
                <dd>{peoples}</dd>
              </div>
              <div>
                <dt>Free cities</dt>
                <dd>{content.map.towns.length}</dd>
              </div>
              <div>
                <dt>Hexes to claim</dt>
                <dd>{(content.map.width * content.map.height).toLocaleString("en-US")}</dd>
              </div>
            </dl>
          </div>
        </section>
      </section>

      <section className="landing-section atlas-section" id="atlas" aria-labelledby="atlas-title">
        <div className="atlas-copy">
          <p className="section-eyebrow">Atlas</p>
          <h2 id="atlas-title">The western sea</h2>
          <p>
            MASSALIA&apos;s hand-drawn world, from the Pillars of Herakles to Italy: its regions, its {content.map.towns.length} cities and the states of Rome,
            Carthage, the Celts and the Iberians, laid out as hexagons. Every town claims the land around it, ships carry armies over open sea, and a colony
            needs a free valley and the culture to hold it.
          </p>
        </div>
        <div className="map-frame" role="img" aria-label="The map of the western sea">
          <img src="map/terrain.webp" alt="" loading="lazy" />
        </div>
      </section>

      <section className="closing-cta" aria-label="Start playing Emporion">
        <div>
          <p className="section-eyebrow">A world is waiting</p>
          <h2>Enter the western sea</h2>
          <p>No download. Play free in your browser.</p>
        </div>
        <button className="primary-cta" type="button" onClick={returning ? play : start}>
          {returning ? "Continue playing" : "Start The Game"}
        </button>
      </section>

      <FrontFooter />
    </main>
  );
}

export const REPO = "https://github.com/Serski/Emporion";

export function FrontFooter() {
  return (
    <footer className="landing-footer">
      <div className="footer-brand">EMPORION</div>
      <nav aria-label="About" className="footer-legal">
        <a href={`${REPO}/blob/main/docs/DESIGN.md`} target="_blank" rel="noopener noreferrer">
          How it works
        </a>
        <a href={`${REPO}/blob/main/docs/RULINGS.md`} target="_blank" rel="noopener noreferrer">
          Game rules
        </a>
        <a href={REPO} target="_blank" rel="noopener noreferrer">
          Source
        </a>
      </nav>
      <small>© 300 BC – MMXXVI · EMPORION · ON MASSALIA&apos;S MAP</small>
    </footer>
  );
}
