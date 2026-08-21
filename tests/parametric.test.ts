import assert from "node:assert/strict";
import test from "node:test";
import { ASSET_CATEGORIES, PARAMETRIC_ASSETS, clampParametricSize, getParametricAsset } from "../lib/engine/parametric.ts";

test("ships a useful cross-room parametric standard library", () => {
  assert.equal(ASSET_CATEGORIES.length, 5);
  assert.ok(PARAMETRIC_ASSETS.length >= 16);
  for (const kind of ["door", "window", "sofa", "bed", "wardrobe", "diningTable", "baseCabinet", "island", "bathtub", "vanity", "toilet", "plant"]) {
    assert.ok(getParametricAsset(kind), `missing ${kind}`);
  }
});

test("keeps every default inside its semantic editing limits", () => {
  for (const asset of PARAMETRIC_ASSETS) {
    for (const axis of ["x", "y", "z"] as const) {
      assert.ok(asset.defaultSize[axis] >= asset.minSize[axis], `${asset.kind}.${axis} below min`);
      assert.ok(asset.defaultSize[axis] <= asset.maxSize[axis], `${asset.kind}.${axis} above max`);
    }
  }
});

test("clamps edited dimensions without changing valid axes", () => {
  const sofa = getParametricAsset("sofa");
  assert.ok(sofa);
  assert.deepEqual(clampParametricSize(sofa, { x: 99, y: .9, z: .2 }), { x: sofa.maxSize.x, y: .9, z: sofa.minSize.z });
});
