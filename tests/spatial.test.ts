import assert from "node:assert/strict";
import test from "node:test";
import { measureSpatialRelationships, movementForClearance, scaleForDimension, type Bounds3 } from "../lib/engine/spatial.ts";

const room: Bounds3 = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 3, z: 10 } };
const selected: Bounds3 = { min: { x: 4, y: 0.5, z: 4 }, max: { x: 6, y: 1.5, z: 6 } };

test("measures dimensions and nearest room/object clearances on all axes", () => {
  const result = measureSpatialRelationships(selected, [
    { id: "left", label: "左柜", bounds: { min: { x: 1, y: 0.5, z: 4.2 }, max: { x: 3, y: 1.5, z: 5.8 } } },
    { id: "right", label: "右柜", bounds: { min: { x: 8, y: 0.5, z: 4.2 }, max: { x: 9, y: 1.5, z: 5.8 } } },
    { id: "not-overlapping", label: "无关物体", bounds: { min: { x: 3.5, y: 2, z: 0 }, max: { x: 3.9, y: 2.5, z: 1 } } },
  ], room);

  assert.deepEqual(result.dimensions, { x: 2, y: 1, z: 2 });
  assert.equal(result.clearances.find(item => item.key === "x-negative")?.distance, 1);
  assert.equal(result.clearances.find(item => item.key === "x-negative")?.referenceLabel, "左柜");
  assert.equal(result.clearances.find(item => item.key === "x-positive")?.distance, 2);
  assert.equal(result.clearances.find(item => item.key === "y-negative")?.distance, 0.5);
  assert.equal(result.clearances.find(item => item.key === "z-positive")?.distance, 4);
});

test("converts an edited clearance into the correct signed movement", () => {
  const result = measureSpatialRelationships(selected, [], room);
  const left = result.clearances.find(item => item.key === "x-negative");
  const right = result.clearances.find(item => item.key === "x-positive");
  assert.ok(left && right);
  assert.equal(movementForClearance(left, 5), 1);
  assert.equal(movementForClearance(right, 5), -1);
  assert.equal(movementForClearance(left, -5), -4);
});

test("calculates a stable scale factor for direct dimension edits", () => {
  assert.equal(scaleForDimension(2, 3), 1.5);
  assert.equal(scaleForDimension(0, 3), 1);
  assert.equal(scaleForDimension(2, 0), 0.005);
});
