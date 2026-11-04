import { useCallback, useEffect, useMemo, useState } from "react";
import { Creation } from "./front/Creation";
import { Landing } from "./front/Landing";
import { Lobby } from "./front/Lobby";
import { BuilderSlots, HeroBadge, HomeTroops, Marches, QuickBar, ResourceBanner, ToastHost, ToolRail, TopBar, VillageSwitcher, ViewSwitch } from "./hud";
import { NavContext, type ModalState, type Nav, type View } from "./nav";
import { endWorld, startWorld, worldName, worldsPlayed } from "./record";
import { goGame, goTo, isBareUrl, routeOf, type Route } from "./route";
import { Session } from "./session";
import { SessionContext } from "./ui";
import { FieldsView } from "./views/FieldsView";
import { TownView } from "./views/TownView";
import { MapBackdrop, MapView } from "./views/MapView";
import { ModalHost } from "./windows/ModalHost";

// The pages around the game, as MASSALIA has them: the front page, the lobby,
// founding a house, and the game itself. A returning player (a save in this
// browser) who opens the bare address goes to the lobby, as MASSALIA (and
// Travian) send a signed-in player.
export function App({ initial, onSession }: { initial: Session | null; onSession: (s: Session | null) => void }) {
  const [session, setSession] = useState<Session | null>(initial);
  const [route, setRoute] = useState<Route>(() => (initial && isBareUrl() ? { page: "lobby", view: "worlds" } : routeOf(window.location.hash)));
  useEffect(() => {
    onSession(session);
  }, [session, onSession]);

  useEffect(() => {
    if (initial && isBareUrl()) window.history.replaceState(null, "", "#/lobby");
    const onHash = () => setRoute(routeOf(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [initial]);

  // The game without a world falls back to the front page.
  const lost = route.page === "game" && !session;
  useEffect(() => {
    if (lost) goTo("/");
  }, [lost]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.page]);

  if (route.page === "game" && session) {
    return (
      <SessionContext.Provider value={session}>
        <GameShell session={session} view={route.view} />
      </SessionContext.Provider>
    );
  }
  if (route.page === "create") {
    return (
      <Creation
        worldName={worldName(worldsPlayed(!!session) + 1)}
        replacing={!!session}
        onComplete={(opts) => {
          if (session) endWorld(session);
          Session.clearSave();
          setSession(Session.create({ ...opts, worldName: startWorld(!!session) }));
          goGame("map");
        }}
      />
    );
  }
  if (route.page === "lobby") {
    return (
      <Lobby
        view={route.view}
        session={session}
        onAbandon={() => {
          Session.clearSave();
          setSession(null);
          goTo("/lobby");
        }}
        onLoad={(s) => {
          s.save();
          setSession(s);
          goTo("/lobby");
        }}
      />
    );
  }
  return <Landing returning={!!session} />;
}

// The Travian Kingdoms arrangement: the view fills the screen; the stores,
// the three views, the hero, the tools, the marches and the builders sit on
// top of it at the edges.
function GameShell({ session, view }: { session: Session; view: View }) {
  const [modal, setModal] = useState<ModalState>(null);
  const [mapFocus, setMapFocus] = useState<number | null>(null);

  useEffect(() => {
    session.tick();
    const id = setInterval(() => session.tick(), 500);
    const save = () => session.save();
    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", save);
    return () => {
      clearInterval(id);
      window.removeEventListener("beforeunload", save);
      document.removeEventListener("visibilitychange", save);
      // Leaving for the lobby or the front page keeps the world as it stands.
      session.save();
    };
  }, [session]);

  const go = useCallback((v: View) => goGame(v), []);
  const close = useCallback(() => setModal(null), []);
  const nav: Nav = useMemo(
    () => ({
      view,
      go,
      open: setModal,
      close,
      mapFocus,
      showOnMap: (tile: number) => {
        setMapFocus(tile);
        setModal(null);
        go("map");
      },
    }),
    [view, go, close, mapFocus],
  );

  return (
    <NavContext.Provider value={nav}>
      <div className={`game game--${view}`}>
        <TopBar />
        <div className="play">
          <main className="stage" id="main">
            {view !== "map" && <MapBackdrop />}
            {view === "fields" && <FieldsView />}
            {view === "town" && <TownView />}
            {view === "map" && <MapView />}
          </main>
          <div className="hud">
            <div className="hud__tl">
              <VillageSwitcher />
            </div>
            <div className="hud__top">
              <ViewSwitch />
              <ResourceBanner />
            </div>
            <div className="hud__tr">
              <HeroBadge />
              <Marches />
              <HomeTroops />
            </div>
            <div className="hud__left">
              <ToolRail />
            </div>
            <div className="hud__bottom">
              <BuilderSlots />
            </div>
            <div className="hud__br">
              <QuickBar />
            </div>
          </div>
        </div>
        <ModalHost modal={modal} />
        <ToastHost />
      </div>
    </NavContext.Provider>
  );
}
