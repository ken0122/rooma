import assert from "node:assert/strict";
import test from "node:test";
import { RenderScheduler } from "../lib/engine/render-scheduler.ts";

function harness(updates: boolean[]) {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const events: string[] = [];
  const scheduler = new RenderScheduler({
    requestFrame: callback => { const id = nextId++; callbacks.set(id, callback); return id; },
    cancelFrame: id => { callbacks.delete(id); },
    now: () => 10,
    update: () => { events.push("update"); return updates.shift() ?? false; },
    refreshShadows: () => { events.push("shadow"); },
    render: () => { events.push("render"); },
  });
  const flushOne = () => {
    const entry = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
    if (!entry) return;
    callbacks.delete(entry[0]);
    entry[1](10);
  };
  return { scheduler, callbacks, events, flushOne };
}

test("coalesces invalidations and leaves no RAF while idle", () => {
  const { scheduler, callbacks, events, flushOne } = harness([false]);
  scheduler.invalidate();
  scheduler.invalidate();
  assert.equal(callbacks.size, 1);
  flushOne();
  assert.equal(callbacks.size, 0);
  assert.deepEqual(events, ["update", "shadow", "render"]);
});

test("continues frames while damping reports camera movement", () => {
  const { scheduler, callbacks, events, flushOne } = harness([true, true, false]);
  scheduler.invalidate();
  flushOne();
  assert.equal(callbacks.size, 1);
  flushOne();
  assert.equal(callbacks.size, 1);
  flushOne();
  assert.equal(callbacks.size, 0);
  assert.equal(events.filter(event => event === "render").length, 3);
});

test("refreshes shadows only after a shadow-dirty invalidation", () => {
  const { scheduler, events, flushOne } = harness([false, false, false]);
  scheduler.invalidate();
  flushOne();
  scheduler.invalidate();
  flushOne();
  scheduler.invalidate({ shadows: true });
  flushOne();
  assert.equal(events.filter(event => event === "shadow").length, 2);
});

test("cancels a queued frame when disposed", () => {
  const { scheduler, callbacks } = harness([false]);
  scheduler.invalidate();
  assert.equal(callbacks.size, 1);
  scheduler.dispose();
  assert.equal(callbacks.size, 0);
  assert.equal(scheduler.pending, false);
});
