import type { Point3 } from "./spatial";
import catalogue from "../../rooma.assets.json" with { type: "json" };

export type AssetCategory = "architecture" | "furniture" | "kitchen" | "bathroom" | "decor";

export type ParametricAsset = {
  kind: string;
  label: string;
  icon: string;
  category: AssetCategory;
  defaultSize: Point3;
  minSize: Point3;
  maxSize: Point3;
};

export const ASSET_CATEGORIES = catalogue.categories as Array<{ id: AssetCategory; label: string }>;
export const PARAMETRIC_ASSETS = catalogue.assets as ParametricAsset[];

export function getParametricAsset(kind: string) {
  return PARAMETRIC_ASSETS.find(asset => asset.kind === kind);
}

export function clampParametricSize(asset: ParametricAsset, size: Point3): Point3 {
  return {
    x: Math.min(asset.maxSize.x, Math.max(asset.minSize.x, size.x)),
    y: Math.min(asset.maxSize.y, Math.max(asset.minSize.y, size.y)),
    z: Math.min(asset.maxSize.z, Math.max(asset.minSize.z, size.z)),
  };
}

export function formatAssetSize(size: Point3) {
  return `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m`;
}
