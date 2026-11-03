import type { ModalState } from "../nav";
import { useNav } from "../nav";
import { useSession } from "../ui";
import { BuildingWindow, ConstructWindow, FieldWindow } from "./BuildWindows";
import { PlayersWindow } from "./PlayersWindow";
import { ReportWindow } from "./ReportWindow";
import { MarketWindow, SendWindow } from "./SendWindow";
import { TileWindow } from "./TileWindow";

export function ModalHost({ modal }: { modal: ModalState }) {
  const s = useSession();
  const nav = useNav();
  if (!modal) return null;
  const v = s.state.villages[s.villageId]!;
  switch (modal.kind) {
    case "field":
      return <FieldWindow index={modal.index} onClose={nav.close} />;
    case "slot": {
      const b = v.buildings[modal.slot];
      const queued = v.buildQueue.find((j) => j.kind === "building" && j.index === modal.slot);
      return b || queued ? <BuildingWindow slot={modal.slot} onClose={nav.close} /> : <ConstructWindow slot={modal.slot} onClose={nav.close} />;
    }
    case "tile":
      return <TileWindow tile={modal.tile} onClose={nav.close} />;
    case "report":
      return <ReportWindow id={modal.id} onClose={nav.close} />;
    case "send":
      return <SendWindow tile={modal.tile} mission={modal.mission} onClose={nav.close} />;
    case "resources":
      return <MarketWindow toVillageId={modal.toVillageId} onClose={nav.close} />;
    case "players":
      return <PlayersWindow onClose={nav.close} />;
  }
}
