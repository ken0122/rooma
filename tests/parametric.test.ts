import assert from "node:assert/strict";
import test from "node:test";
import { ASSET_CATEGORIES, PARAMETRIC_ASSETS, clampParametricSize, getParametricAsset } from "../lib/engine/parametric.ts";
import { constrainPositionToMount, defaultMountedPosition, mountLockedAxes } from "../lib/engine/mounting.ts";

test("ships a useful cross-room parametric standard library", () => {
  assert.equal(ASSET_CATEGORIES.length, 5);
  assert.ok(PARAMETRIC_ASSETS.length >= 16);
  for (const kind of ["door", "window", "sofa", "bed", "wardrobe", "diningTable", "baseCabinet", "island", "bathtub", "vanity", "toilet", "plant", "ceilingLight"]) {
    assert.ok(getParametricAsset(kind), `missing ${kind}`);
  }
});

test("keeps every default inside its semantic editing limits", () => {
  for (const asset of PARAMETRIC_ASSETS) {
    assert.ok(["floor", "wall", "ceiling"].includes(asset.defaultMount.surface), `${asset.kind} missing mount surface`);
    for (const axis of ["x", "y", "z"] as const) {
      assert.ok(asset.defaultSize[axis] >= asset.minSize[axis], `${asset.kind}.${axis} below min`);
      assert.ok(asset.defaultSize[axis] <= asset.maxSize[axis], `${asset.kind}.${axis} above max`);
    }
  }
});

test("places and constrains assets on their semantic mount surface", () => {
  const room = { width: 6, depth: 5, height: 3 };
  const floor = defaultMountedPosition({ surface: "floor", size: { x: 1, y: 1, z: 1 }, room, offset: .5 });
  assert.deepEqual(floor.position, { x: .5, y: 0, z: .5 });
  assert.deepEqual(mountLockedAxes("floor"), ["y"]);

  const ceiling = constrainPositionToMount({ surface: "ceiling", position: { x: 9, y: 0, z: -9 }, size: { x: .6, y: .2, z: .6 }, rotationY: 0, room });
  assert.deepEqual(ceiling.position, { x: 2.7, y: 2.8, z: -2.2 });

  const wall = defaultMountedPosition({ surface: "wall", size: { x: 1.5, y: 1.4, z: .16 }, room, elevation: .9 });
  assert.equal(wall.wallFace, "z-negative");
  assert.deepEqual(wall.position, { x: 0, y: .9, z: -2.42 });
  assert.deepEqual(mountLockedAxes("wall", wall.wallFace), ["z"]);
});

test("clamps edited dimensions without changing valid axes", () => {
  const sofa = getParametricAsset("sofa");
  assert.ok(sofa);
  assert.deepEqual(clampParametricSize(sofa, { x: 99, y: .9, z: .2 }), { x: sofa.maxSize.x, y: .9, z: sofa.minSize.z });
});
