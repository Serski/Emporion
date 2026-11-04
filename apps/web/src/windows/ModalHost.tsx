import type { ModalState } from "../nav";
import { useNav } from "../nav";
import { useSession } from "../ui";
import { BuildingWindow, ConstructWindow, FieldWindow } from "./BuildWindows";
import { HeroWindow } from "./HeroWindow";
import { KingdomWindow } from "./KingdomWindow";
import { PlayersWindow } from "./PlayersWindow";
import { ReportWindow } from "./ReportWindow";
import { ReportsWindow } from "./ReportsWindow";
import { MarketWindow, SendWindow } from "./SendWindow";
import { StatsWindow } from "./StatsWindow";
import { TileWindow } from "./TileWindow";
import { TroopsWindow } from "./TroopsWindow";

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
    case "reports":
      return <ReportsWindow onClose={nav.close} />;
    case "send":
      return <SendWindow tile={modal.tile} mission={modal.mission} onClose={nav.close} />;
    case "resources":
      return <MarketWindow toVillageId={modal.toVillageId} onClose={nav.close} />;
    case "players":
      return <PlayersWindow onClose={nav.close} />;
    case "stats":
      return <StatsWindow onClose={nav.close} />;
    case "hero":
      return <HeroWindow key={modal.tab ?? "hero"} tab={modal.tab} onClose={nav.close} />;
    case "kingdom":
      return <KingdomWindow onClose={nav.close} />;
    case "troops":
      return <TroopsWindow onClose={nav.close} />;
  }
}
