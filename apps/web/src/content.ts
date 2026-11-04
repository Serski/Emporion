import { parseContent, type ContentBundle } from "@emporion/engine";
import buildings from "../../../content/buildings.json";
import family from "../../../content/family.json";
import hero from "../../../content/hero.json";
import kingdoms from "../../../content/kingdoms.json";
import map from "../../../content/map/tiles.json";
import crafting from "../../../content/massalia/crafting.json";
import intrigue from "../../../content/massalia/intrigue.json";
import market from "../../../content/massalia/market.json";
import people from "../../../content/massalia/people.json";
import profile from "../../../content/massalia/profile.json";
import ships from "../../../content/massalia/ships.json";
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
  family,
  massalia: { market, people, profile, crafting, ships, intrigue },
  map,
  factions: Object.keys(factionFiles)
    .sort()
    .map((k) => factionFiles[k]),
} as unknown as ContentBundle);

export const asset = (file: string) => `assets/${encodeURI(file)}`;
