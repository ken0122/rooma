import assert from "node:assert/strict";
import test from "node:test";
import { ProjectHistory } from "../lib/engine/project-history.ts";

test("project history covers add, update, remove, undo and redo", () => {
  const history = new ProjectHistory<{ id: string; x: number }>(3);
  const added = { id: "sofa-1", x: 0 };
  const moved = { id: "sofa-1", x: 1 };

  history.record({ before: null, after: added });
  history.record({ before: added, after: moved });
  history.record({ before: moved, after: null });
  assert.equal(history.canUndo, true);
  assert.deepEqual(history.takeUndo()?.before, moved);
  assert.deepEqual(history.takeUndo()?.before, added);
  assert.deepEqual(history.takeUndo()?.before, null);
  assert.equal(history.canUndo, false);
  assert.deepEqual(history.takeRedo()?.after, added);
  assert.deepEqual(history.takeRedo()?.after, moved);
  assert.deepEqual(history.takeRedo()?.after, null);
  assert.equal(history.canRedo, false);
});

test("recording a new entry clears redo and history respects its limit", () => {
  const history = new ProjectHistory<number>(2);
  history.record({ before: 0, after: 1 });
  history.record({ before: 1, after: 2 });
  history.takeUndo();
  assert.equal(history.canRedo, true);
  history.record({ before: 1, after: 3 });
  assert.equal(history.canRedo, false);
  history.record({ before: 3, after: 4 });
  assert.deepEqual(history.takeUndo(), { before: 3, after: 4 });
  assert.deepEqual(history.takeUndo(), { before: 1, after: 3 });
  assert.equal(history.takeUndo(), null);
});
