import type { Point3 } from "./spatial";

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

export const ASSET_CATEGORIES: Array<{ id: AssetCategory; label: string }> = [
  { id: "architecture", label: "建筑" },
  { id: "furniture", label: "家具" },
  { id: "kitchen", label: "厨房" },
  { id: "bathroom", label: "卫浴" },
  { id: "decor", label: "陈设" },
];

export const PARAMETRIC_ASSETS: ParametricAsset[] = [
  { kind: "door", label: "平开门", icon: "▯", category: "architecture", defaultSize: { x: .9, y: 2.1, z: .12 }, minSize: { x: .6, y: 1.8, z: .08 }, maxSize: { x: 1.8, y: 2.8, z: .3 } },
  { kind: "window", label: "标准窗", icon: "⊞", category: "architecture", defaultSize: { x: 1.5, y: 1.4, z: .16 }, minSize: { x: .5, y: .5, z: .08 }, maxSize: { x: 4, y: 2.5, z: .35 } },
  { kind: "partition", label: "轻质隔墙", icon: "▰", category: "architecture", defaultSize: { x: 2.4, y: 2.8, z: .12 }, minSize: { x: .4, y: 1.8, z: .08 }, maxSize: { x: 6, y: 3.8, z: .4 } },
  { kind: "sofa", label: "三人沙发", icon: "▱", category: "furniture", defaultSize: { x: 2.1, y: .85, z: .9 }, minSize: { x: 1.2, y: .65, z: .65 }, maxSize: { x: 3.6, y: 1.2, z: 1.25 } },
  { kind: "armchair", label: "休闲椅", icon: "◇", category: "furniture", defaultSize: { x: .78, y: .88, z: .82 }, minSize: { x: .55, y: .65, z: .55 }, maxSize: { x: 1.3, y: 1.25, z: 1.3 } },
  { kind: "diningTable", label: "餐桌", icon: "▭", category: "furniture", defaultSize: { x: 1.6, y: .75, z: .85 }, minSize: { x: .8, y: .55, z: .55 }, maxSize: { x: 3.2, y: 1.1, z: 1.6 } },
  { kind: "bed", label: "双人床", icon: "▤", category: "furniture", defaultSize: { x: 1.8, y: 1.05, z: 2.1 }, minSize: { x: .9, y: .6, z: 1.8 }, maxSize: { x: 2.4, y: 1.5, z: 2.5 } },
  { kind: "wardrobe", label: "衣柜", icon: "▥", category: "furniture", defaultSize: { x: 1.8, y: 2.2, z: .6 }, minSize: { x: .6, y: 1.2, z: .35 }, maxSize: { x: 4, y: 3.2, z: .9 } },
  { kind: "shelf", label: "开放书架", icon: "目", category: "furniture", defaultSize: { x: 1.2, y: 1.9, z: .36 }, minSize: { x: .45, y: .7, z: .2 }, maxSize: { x: 3, y: 3, z: .7 } },
  { kind: "baseCabinet", label: "地柜", icon: "▥", category: "kitchen", defaultSize: { x: 1.2, y: .9, z: .62 }, minSize: { x: .4, y: .65, z: .4 }, maxSize: { x: 4, y: 1.2, z: .9 } },
  { kind: "island", label: "厨房岛台", icon: "▰", category: "kitchen", defaultSize: { x: 1.8, y: .92, z: .9 }, minSize: { x: .8, y: .7, z: .55 }, maxSize: { x: 3.6, y: 1.2, z: 1.4 } },
  { kind: "bathtub", label: "独立浴缸", icon: "◡", category: "bathroom", defaultSize: { x: 1.7, y: .62, z: .78 }, minSize: { x: 1.2, y: .45, z: .6 }, maxSize: { x: 2.4, y: .9, z: 1.2 } },
  { kind: "vanity", label: "洗漱台", icon: "◉", category: "bathroom", defaultSize: { x: 1.2, y: .9, z: .58 }, minSize: { x: .55, y: .65, z: .4 }, maxSize: { x: 2.8, y: 1.2, z: .85 } },
  { kind: "toilet", label: "智能马桶", icon: "◒", category: "bathroom", defaultSize: { x: .66, y: .72, z: .72 }, minSize: { x: .48, y: .55, z: .58 }, maxSize: { x: .9, y: 1, z: 1 } },
  { kind: "stool", label: "圆凳", icon: "○", category: "decor", defaultSize: { x: .48, y: .5, z: .48 }, minSize: { x: .3, y: .3, z: .3 }, maxSize: { x: .9, y: .85, z: .9 } },
  { kind: "plant", label: "盆栽绿植", icon: "♧", category: "decor", defaultSize: { x: .65, y: 1.05, z: .65 }, minSize: { x: .35, y: .5, z: .35 }, maxSize: { x: 1.4, y: 2.2, z: 1.4 } },
];

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
