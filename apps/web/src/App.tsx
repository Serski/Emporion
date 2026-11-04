import { useCallback, useEffect, useMemo, useState } from "react";
import { BuilderSlots, HeroBadge, HomeTroops, Marches, QuickBar, ResourceBanner, ToastHost, ToolRail, TopBar, VillageSwitcher, ViewSwitch } from "./hud";
import { NavContext, VIEWS, type ModalState, type Nav, type View } from "./nav";
import { Session } from "./session";
import { SessionContext } from "./ui";
import { FieldsView } from "./views/FieldsView";
import { TownView } from "./views/TownView";
import { MapView } from "./views/MapView";
import { NewGame } from "./views/NewGame";
import { ModalHost } from "./windows/ModalHost";

function viewFromHash(): View {
  const h = window.location.hash.replace(/^#/, "");
  return (VIEWS as readonly string[]).includes(h) ? (h as View) : "fields";
}

export function App({ initial, onSession }: { initial: Session | null; onSession: (s: Session | null) => void }) {
  const [session, setSession] = useState<Session | null>(initial);
  useEffect(() => {
    onSession(session);
  }, [session, onSession]);

  if (!session) {
    return (
      <NewGame
        onStart={(opts) => {
          Session.clearSave();
          setSession(Session.create(opts));
        }}
      />
    );
  }
  return (
    <SessionContext.Provider value={session}>
      <GameShell
        onNewWorld={() => {
          Session.clearSave();
          setSession(null);
        }}
        session={session}
      />
    </SessionContext.Provider>
  );
}

// The Travian Kingdoms arrangement: the view fills the screen; the stores,
// the three views, the hero, the tools, the marches and the builders sit on
// top of it at the edges.
function GameShell({ session, onNewWorld }: { session: Session; onNewWorld: () => void }) {
  const [view, setView] = useState<View>(viewFromHash);
  const [modal, setModal] = useState<ModalState>(null);
  const [mapFocus, setMapFocus] = useState<number | null>(null);

  // The new-game form may have been scrolled; the game opens at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

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
    };
  }, [session]);

  useEffect(() => {
    const onNew = () => onNewWorld();
    window.addEventListener("emporion:new-world", onNew);
    return () => window.removeEventListener("emporion:new-world", onNew);
  }, [onNewWorld]);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((v: View) => {
    setView(v);
    if (window.location.hash !== `#${v}`) window.location.hash = v;
  }, []);
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
