import { parseContent, type ContentBundle } from "@emporion/engine";
import buildings from "../../../content/buildings.json";
import hero from "../../../content/hero.json";
import kingdoms from "../../../content/kingdoms.json";
import map from "../../../content/map/tiles.json";
import resources from "../../../content/resources.json";
import world from "../../../content/world.json";

// The same rules a server would load at boot, validated the same way.
const factionFiles = import.meta.glob("../../../content/factions/*.json", { eager: true, import: "default" });

export const content = parseContent({
  world,
  resources,
  buildings,
  hero,
  kingdoms,
  map,
  factions: Object.keys(factionFiles)
    .sort()
    .map((k) => factionFiles[k]),
} as unknown as ContentBundle);

export const asset = (file: string) => `assets/${encodeURI(file)}`;
