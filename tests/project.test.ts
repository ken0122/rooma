import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PROJECT, ROOMA_PROJECT_BACKUP_KEY, ROOMA_PROJECT_STORAGE_KEY, encodeRoomaProject, loadRoomaProjectFromBrowser, normalizeRoomaProjectWithReport, persistRoomaProject, restoreRoomaProjectBackupFromBrowser } from "../lib/project.ts";

class MemoryStorage {
  readonly values = new Map<string, string>();
  failWrites = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failWrites) throw new DOMException("quota", "QuotaExceededError"); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function browserHarness(hash = "") {
  const localStorage = new MemoryStorage();
  const location = { hash, pathname: "/", search: "" };
  const history = {
    state: null,
    replaceState(_state: unknown, _title: string, url: string) {
      const next = new URL(url, "https://rooma.test");
      location.hash = next.hash;
      location.pathname = next.pathname;
      location.search = next.search;
    },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage, location, history } });
  return { localStorage, location };
}

test.afterEach(() => { Reflect.deleteProperty(globalThis, "window"); });

test("hash project is imported once, backs up the local draft and survives refresh", () => {
  const incoming = structuredClone(DEFAULT_PROJECT);
  incoming.project.name = "分享方案";
  const { localStorage, location } = browserHarness(`#project=${encodeRoomaProject(incoming)}`);
  const localDraft = structuredClone(DEFAULT_PROJECT);
  localDraft.project.name = "原草稿";
  localStorage.setItem(ROOMA_PROJECT_STORAGE_KEY, JSON.stringify(localDraft));

  const first = loadRoomaProjectFromBrowser();
  assert.equal(first.project.project.name, "分享方案");
  assert.equal(first.source, "hash");
  assert.equal(first.backupAvailable, true);
  assert.equal(location.hash, "");

  first.project.project.name = "继续编辑";
  assert.equal(persistRoomaProject(first.project).ok, true);
  const refreshed = loadRoomaProjectFromBrowser();
  assert.equal(refreshed.project.project.name, "继续编辑");
  assert.equal(JSON.parse(localStorage.getItem(ROOMA_PROJECT_BACKUP_KEY) ?? "{}").project.name, "原草稿");
  assert.equal(restoreRoomaProjectBackupFromBrowser().ok, true);
  assert.equal(loadRoomaProjectFromBrowser().project.project.name, "原草稿");
});

test("invalid or unsupported hash never overwrites the local project", () => {
  const invalid = { ...DEFAULT_PROJECT, schemaVersion: 2 } as unknown;
  const encoded = Buffer.from(JSON.stringify(invalid), "utf8").toString("base64url");
  const { localStorage, location } = browserHarness(`#project=${encoded}`);
  const localDraft = structuredClone(DEFAULT_PROJECT);
  localDraft.project.name = "保留方案";
  localStorage.setItem(ROOMA_PROJECT_STORAGE_KEY, JSON.stringify(localDraft));
  const loaded = loadRoomaProjectFromBrowser();
  assert.equal(loaded.project.project.name, "保留方案");
  assert.match(loaded.notice ?? "", /无效/);
  assert.equal(location.hash, "");
});

test("normalization reports repairs and shares room constraints with CLI", () => {
  const input = structuredClone(DEFAULT_PROJECT);
  input.project.room.width = 0.5;
  input.project.room.depth = 0.5;
  input.objects.push({ ...structuredClone(input.objects[0]), id: input.objects[0].id });
  const normalized = normalizeRoomaProjectWithReport(input);
  assert.equal(normalized.project.project.room.width, 0.5);
  assert.equal(normalized.project.project.room.depth, 0.5);
  assert.ok(normalized.repairs.some(repair => repair.code === "DUPLICATE_ID"));
  assert.equal(new Set(normalized.project.objects.map(object => object.id)).size, normalized.project.objects.length);
});

test("storage failures are returned instead of escaping into the editor", () => {
  const { localStorage } = browserHarness();
  localStorage.failWrites = true;
  const result = persistRoomaProject(DEFAULT_PROJECT);
  assert.equal(result.ok, false);
});
