import { VIEWS, type View } from "./nav";

// ---------------------------------------------------------------------------
// The pages around the game, as MASSALIA lays them out: the front page, the
// lobby (worlds, hall of fame, settings), character creation and the game.
// Hash routes, so the static build works from any folder (GitHub Pages):
//   ""  "#/"                    the front page
//   "#/lobby"  "#/lobby/<view>" the lobby
//   "#/create"                  found a house
//   "#map"  "#fields"  "#town"  the game, on one of its three views
// ---------------------------------------------------------------------------

export type LobbyView = "worlds" | "hall-of-fame" | "settings";

export type Route = { page: "landing" } | { page: "lobby"; view: LobbyView } | { page: "create" } | { page: "game"; view: View };

const LOBBY: Record<string, LobbyView> = {
  "/lobby": "worlds",
  "/lobby/hall-of-fame": "hall-of-fame",
  "/lobby/settings": "settings",
};

export function routeOf(hash: string): Route {
  const h = hash.replace(/^#/, "").replace(/\/+$/, "");
  if ((VIEWS as readonly string[]).includes(h)) return { page: "game", view: h as View };
  if (h === "/create") return { page: "create" };
  const lobby = LOBBY[h];
  if (lobby) return { page: "lobby", view: lobby };
  return { page: "landing" };
}

export const isBareUrl = () => window.location.hash.replace(/^#\/?/, "") === "";

export function goTo(path: string) {
  const hash = path === "/" ? "#/" : `#${path}`;
  if (window.location.hash !== hash) window.location.hash = hash;
}

// Into the game, on one of its views (the map unless told otherwise).
export function goGame(view: View = "map") {
  if (window.location.hash !== `#${view}`) window.location.hash = view;
}

export const LOBBY_PATH: Record<LobbyView, string> = { worlds: "/lobby", "hall-of-fame": "/lobby/hall-of-fame", settings: "/lobby/settings" };
