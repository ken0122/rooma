import assert from "node:assert/strict";
import test from "node:test";
import { clampPointToBounds, measureSpatialRelationships, movementForClearance, positionLimitsForBounds, scaleForDimension, type Bounds3 } from "../lib/engine/spatial.ts";
import { boundsForSizedObject, objectOutsideRoomBounds, spatialIssuesForObject } from "../lib/project-domain.js";

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

test("derives object-origin limits that keep its current world bounds inside the room", () => {
  const objectBounds: Bounds3 = { min: { x: 3.2, y: 0.5, z: 3.5 }, max: { x: 6.8, y: 1.5, z: 6.5 } };
  const limits = positionLimitsForBounds(room, objectBounds, { x: 5, y: 0.5, z: 5 });
  assert.ok(Math.abs(limits.min.x - 1.8) < Number.EPSILON * 2);
  assert.deepEqual({ ...limits, min: { ...limits.min, x: 1.8 } }, { min: { x: 1.8, y: 0, z: 1.5 }, max: { x: 8.2, y: 2, z: 8.5 } });
});

test("clamps extreme or non-finite drag positions and centers oversized objects", () => {
  const limits: Bounds3 = { min: { x: 1, y: 0, z: 2 }, max: { x: 9, y: 2, z: 8 } };
  assert.deepEqual(
    clampPointToBounds({ x: Number.POSITIVE_INFINITY, y: -99, z: Number.NaN }, limits, { x: 4, y: 1, z: 6 }),
    { x: 4, y: 0, z: 6 },
  );
  assert.deepEqual(
    positionLimitsForBounds(room, { min: { x: -1, y: 0, z: -1 }, max: { x: 11, y: 4, z: 11 } }, { x: 5, y: 2, z: 5 }),
    { min: { x: 5, y: 1.5, z: 5 }, max: { x: 5, y: 1.5, z: 5 } },
  );
});

test("shared semantic bounds include rotation and report room/collision issues", () => {
  const object = { id: "bed-1", label: "双人床", position: { x: 2, y: 0, z: 0 }, rotationY: 45, size: { x: 1.8, y: 1.05, z: 2.1 } };
  const bounds = boundsForSizedObject(object);
  assert.ok(bounds.max.x > 3);
  assert.equal(objectOutsideRoomBounds({ width: 6, depth: 5.1, height: 3.05 }, object), true);
  const issues = spatialIssuesForObject({ width: 6, depth: 5.1, height: 3.05 }, object, [
    object,
    { id: "chair-1", label: "休闲椅", position: { x: 1.2, y: 0, z: 0 }, rotationY: 0, size: { x: 1, y: 1, z: 1 } },
  ]);
  assert.deepEqual(issues.map(issue => issue.code).sort(), ["OBJECT_COLLISION", "OUTSIDE_ROOM"]);
});
