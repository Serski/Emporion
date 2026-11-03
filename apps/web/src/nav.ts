import { createContext, useContext } from "react";
import type { MissionKind } from "@emporion/engine";

export const VIEWS = ["fields", "town", "map", "reports", "rankings", "hero", "kingdom"] as const;
export type View = (typeof VIEWS)[number];

export type ModalState =
  | { kind: "field"; index: number }
  | { kind: "slot"; slot: number }
  | { kind: "tile"; tile: number }
  | { kind: "report"; id: string }
  | { kind: "send"; tile?: number; mission?: MissionKind }
  | { kind: "resources"; toVillageId?: string }
  | { kind: "players" }
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
