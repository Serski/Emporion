import { createContext, useContext } from "react";
import type { MissionKind } from "@emporion/engine";

// Three views fill the screen, as in Travian Kingdoms: the fields around the
// town, the town centre and the world map. Everything else opens as a window.
export const VIEWS = ["fields", "town", "map"] as const;
export type View = (typeof VIEWS)[number];

export type HeroTab = "hero" | "family" | "lineage";

export type ModalState =
  | { kind: "field"; index: number }
  | { kind: "slot"; slot: number }
  | { kind: "tile"; tile: number }
  | { kind: "report"; id: string }
  | { kind: "send"; tile?: number; mission?: MissionKind }
  | { kind: "resources"; toVillageId?: string }
  | { kind: "players" }
  | { kind: "reports" }
  | { kind: "stats" }
  | { kind: "hero"; tab?: HeroTab }
  | { kind: "kingdom" }
  | { kind: "troops" }
  | null;

export interface Nav {
  view: View;
  go: (view: View) => void;
  open: (modal: ModalState) => void;
  close: () => void;
  showOnMap: (tile: number) => void;
  mapFocus: number | null;
}

export const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const n = useContext(NavContext);
  if (!n) throw new Error("no nav");
  return n;
}
