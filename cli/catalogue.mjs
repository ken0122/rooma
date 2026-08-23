import { readFileSync } from "node:fs";

const catalogue = JSON.parse(readFileSync(new URL("../rooma.assets.json", import.meta.url), "utf8"));

export const ASSET_CATEGORIES = catalogue.categories;
export const PARAMETRIC_ASSETS = catalogue.assets;

export function getAsset(kind) {
  return PARAMETRIC_ASSETS.find(asset => asset.kind === kind);
}
