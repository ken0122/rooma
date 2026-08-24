import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";
import { historyPathFor, journalPathFor } from "../cli/storage.mjs";

const repoRoot = new URL("../", import.meta.url);
const cliPath = new URL("../cli/rooma.mjs", import.meta.url);
const baselinePath = new URL("../rooma.default-project.json", import.meta.url);

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "rooma-cli-"));
  const file = join(directory, "project.json");
  await writeFile(file, await readFile(baselinePath, "utf8"), "utf8");
  return { directory, file, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

function run(file, ...args) {
  const result = spawnSync(process.execPath, [cliPath.pathname, "--file", file, "--json", ...args], {
    cwd: repoRoot.pathname,
    encoding: "utf8",
  });
  let payload;
  try { payload = JSON.parse(result.stdout); }
  catch { throw new Error(`CLI 未返回 JSON。status=${result.status}\nstdout=${result.stdout}\nstderr=${result.stderr}`); }
  return { ...result, payload };
}

function runAsync(file, ...args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cliPath.pathname, "--file", file, "--json", ...args], { cwd: repoRoot.pathname });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", status => {
      try { resolvePromise({ status, stdout, stderr, payload: JSON.parse(stdout) }); }
      catch { reject(new Error(`CLI 未返回 JSON。status=${status}\nstdout=${stdout}\nstderr=${stderr}`)); }
    });
  });
}

test("status、assets、validate 和 url 提供稳定机器输出", async t => {
  const { file, cleanup } = await fixture();
  t.after(cleanup);

  const status = run(file, "status");
  assert.equal(status.status, 0);
  assert.equal(status.payload.ok, true);
  assert.equal(status.payload.result.objectCount, 6);
  assert.equal(status.payload.result.selectedObject, null);
  assert.ok(Math.abs(status.payload.result.room.area - 30.6) < 1e-9);

  const assets = run(file, "assets");
  assert.equal(assets.status, 0);
  assert.equal(assets.payload.result.count, 16);
  assert.ok(assets.payload.result.assets.some(asset => asset.kind === "sofa"));
  const filtered = run(file, "assets", "--category", "bathroom", "--query", "马桶");
  assert.deepEqual(filtered.payload.result.assets.map(asset => asset.kind), ["toilet"]);

  const validation = run(file, "validate");
  assert.equal(validation.payload.result.valid, true);

  const link = run(file, "url", "--base", "https://example.test/editor");
  const encoded = new URL(link.payload.result.url).hash.slice(1).split("=")[1];
  const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  assert.equal(decoded.project.name, "主卫改造方案");
  assert.equal(decoded.objects.length, 6);
});

test("自然语言常用对象流程可添加、更新、复制、选择和删除", async t => {
  const { file, directory, cleanup } = await fixture();
  t.after(cleanup);

  const added = run(file, "object", "add", "sofa", "--label", "会客沙发", "--position", "0.4,0,0.2", "--size", "2.2,0.9,0.9");
  assert.equal(added.status, 0);
  assert.equal(added.payload.result.object.id, "sofa-1");
  assert.match(added.payload.openUrl, /#project=/);

  const updated = run(file, "object", "update", "会客沙发", "--x", "0.8", "--width", "2.4", "--rotation", "90");
  assert.equal(updated.status, 0);
  assert.equal(updated.payload.result.object.position.x, 0.8);
  assert.equal(updated.payload.result.object.size.x, 2.4);
  assert.equal(updated.payload.result.object.rotationY, 90);

  const duplicated = run(file, "object", "duplicate", "sofa-1", "--label", "备用沙发", "--offset", "0.5,0,-0.25");
  assert.equal(duplicated.payload.result.object.id, "sofa-2");
  assert.equal(duplicated.payload.result.object.position.x, 1.3);

  const selected = run(file, "select", "备用沙发");
  assert.equal(selected.payload.result.selectedObject.id, "sofa-2");
  const removed = run(file, "object", "remove", "sofa-1");
  assert.equal(removed.payload.result.removed.label, "会客沙发");
  const listed = run(file, "object", "list");
  assert.equal(listed.payload.result.count, 7);
  assert.equal(listed.payload.result.objects.some(object => object.id === "sofa-1"), false);
  assert.equal(listed.payload.result.objects.some(object => object.id === "sofa-2"), true);

  const files = await readdir(directory);
  assert.equal(files.some(name => name.endsWith(".tmp")), false);
});

test("object inspect 输出六向净距，clearance 按最近参照调整位置", async t => {
  const { file, cleanup } = await fixture();
  t.after(cleanup);

  const before = run(file, "object", "inspect", "toilet-3");
  assert.equal(before.status, 0);
  assert.equal(before.payload.result.clearances.length, 6);
  const rightBefore = before.payload.result.clearances.find(item => item.key === "x-positive");
  assert.equal(rightBefore.referenceLabel, "右侧墙体");
  assert.ok(Math.abs(rightBefore.distance - 1.32) < 1e-9);

  const changed = run(file, "object", "clearance", "智能马桶", "right", "0.8");
  assert.equal(changed.status, 0);
  assert.ok(Math.abs(changed.payload.result.movement.delta - 0.52) < 1e-9);
  assert.ok(Math.abs(changed.payload.result.object.position.x - 1.87) < 1e-9);
  assert.ok(Math.abs(changed.payload.result.clearance.distance - 0.8) < 1e-9);
});

test("项目、房间、视图、主题和标注状态都可持久修改", async t => {
  const { file, cleanup } = await fixture();
  t.after(cleanup);

  assert.equal(run(file, "project", "rename", "客厅", "方案", "A").status, 0);
  assert.equal(run(file, "room", "set", "--name", "客厅", "--width", "7", "--depth", "6", "--height", "3.2").status, 0);
  assert.equal(run(file, "view", "set", "iso").status, 0);
  assert.equal(run(file, "theme", "set", "green").status, 0);
  assert.equal(run(file, "measurements", "off").status, 0);

  const project = JSON.parse(await readFile(file, "utf8"));
  assert.equal(project.project.name, "客厅 方案 A");
  assert.deepEqual(project.project.room, { name: "客厅", width: 7, depth: 6, height: 3.2 });
  assert.equal(project.project.view, "ISO");
  assert.equal(project.project.colorMode, "green");
  assert.equal(project.project.measurementsVisible, false);
});

test("undo、redo 和 reset 覆盖持久状态并保持可继续撤销", async t => {
  const { file, cleanup } = await fixture();
  t.after(cleanup);

  run(file, "project", "rename", "版本二");
  assert.equal(run(file, "undo").status, 0);
  assert.equal(JSON.parse(await readFile(file, "utf8")).project.name, "主卫改造方案");
  assert.equal(run(file, "redo").status, 0);
  assert.equal(JSON.parse(await readFile(file, "utf8")).project.name, "版本二");

  run(file, "object", "add", "bed");
  assert.equal(JSON.parse(await readFile(file, "utf8")).objects.length, 7);
  assert.equal(run(file, "reset").status, 0);
  assert.equal(JSON.parse(await readFile(file, "utf8")).objects.length, 6);
  assert.equal(run(file, "undo").status, 0);
  assert.equal(JSON.parse(await readFile(file, "utf8")).objects.length, 7);
});

test("batch 将一句自然语言中的多项修改作为单个原子事务", async t => {
  const { file, cleanup } = await fixture();
  t.after(cleanup);
  const commands = JSON.stringify([
    ["object", "update", "toilet-3", "--x", "1.05"],
    ["view", "set", "ISO"],
    ["theme", "set", "green"],
    ["measurements", "off"],
  ]);
  const changed = run(file, "batch", "--commands", commands);
  assert.equal(changed.status, 0);
  assert.equal(changed.payload.result.count, 4);
  const project = JSON.parse(await readFile(file, "utf8"));
  assert.equal(project.objects.find(object => object.id === "toilet-3").position.x, 1.05);
  assert.equal(project.project.view, "ISO");
  assert.equal(project.project.colorMode, "green");
  assert.equal(project.project.measurementsVisible, false);
  assert.equal(run(file, "undo").status, 0);
  const restored = JSON.parse(await readFile(file, "utf8"));
  assert.equal(restored.objects.find(object => object.id === "toilet-3").position.x, 1.35);
  assert.equal(restored.project.view, "3D");
  assert.equal(restored.project.colorMode, "blue");
  assert.equal(restored.project.measurementsVisible, false);
});

test("非法命令明确非零退出且不会损坏项目文件", async t => {
  const { file, cleanup } = await fixture();
  t.after(cleanup);
  const original = await readFile(file, "utf8");

  const invalidSize = run(file, "object", "add", "sofa", "--width", "99");
  assert.notEqual(invalidSize.status, 0);
  assert.equal(invalidSize.payload.ok, false);
  assert.equal(invalidSize.payload.error.code, "SIZE_OUT_OF_RANGE");
  assert.equal(await readFile(file, "utf8"), original);

  const unknown = run(file, "object", "remove", "不存在的对象");
  assert.equal(unknown.status, 4);
  assert.equal(unknown.payload.error.code, "OBJECT_NOT_FOUND");
  assert.equal(await readFile(file, "utf8"), original);
});

test("validate 对无效工程返回稳定 validation result 和非零退出码", async t => {
  const { file, cleanup } = await fixture();
  t.after(cleanup);
  const invalid = JSON.parse(await readFile(file, "utf8"));
  invalid.project.name = "";
  await writeFile(file, `${JSON.stringify(invalid)}\n`, "utf8");
  const validation = run(file, "validate");
  assert.equal(validation.status, 3);
  assert.equal(validation.payload.ok, false);
  assert.equal(validation.payload.result.valid, false);
  assert.ok(validation.payload.result.errors.some(error => error.includes("project.name")));
});

test("旋转后的轴对齐包围盒参与房间越界 warning", async t => {
  const { file, cleanup } = await fixture();
  t.after(cleanup);
  assert.equal(run(file, "object", "add", "bed", "--id", "edge-bed", "--position", "2,0,0").status, 0);
  const rotated = run(file, "object", "update", "edge-bed", "--rotation", "45");
  assert.equal(rotated.status, 0);
  assert.deepEqual(rotated.payload.result.warnings, ["对象超出当前房间边界"]);
  assert.ok(run(file, "object", "inspect", "edge-bed").payload.result.bounds.max.x > 3);
});

test("共享历史目录按工程绝对路径隔离同名文件", () => {
  const previous = process.env.ROOMA_HISTORY_DIR;
  process.env.ROOMA_HISTORY_DIR = "/tmp/rooma-history-tests";
  try {
    assert.notEqual(historyPathFor("/tmp/a/project.json"), historyPathFor("/tmp/b/project.json"));
  } finally {
    if (previous === undefined) delete process.env.ROOMA_HISTORY_DIR;
    else process.env.ROOMA_HISTORY_DIR = previous;
  }
});

test("遗留 journal 会在下一条命令前恢复工程和历史", async t => {
  const { file, cleanup } = await fixture();
  t.after(cleanup);
  const next = JSON.parse(await readFile(file, "utf8"));
  next.project.name = "已恢复事务";
  const historyFile = historyPathFor(file);
  const history = { schemaVersion: 1, undo: [{ description: "恢复前", project: JSON.parse(await readFile(file, "utf8")) }], redo: [] };
  await writeFile(journalPathFor(file), `${JSON.stringify({ schemaVersion: 1, projectFile: file, historyFile, project: next, history })}\n`, "utf8");
  const status = run(file, "status");
  assert.equal(status.status, 0);
  assert.equal(status.payload.result.name, "已恢复事务");
  assert.deepEqual(JSON.parse(await readFile(historyFile, "utf8")), history);
  await assert.rejects(readFile(journalPathFor(file), "utf8"), error => error?.code === "ENOENT");
});

test("并发 CLI 写操作通过工程锁串行化且不丢更新", async t => {
  const { file, cleanup } = await fixture();
  t.after(cleanup);
  const results = await Promise.all(Array.from({ length: 10 }, () => runAsync(file, "measurements", "toggle")));
  assert.ok(results.every(result => result.status === 0 && result.payload.ok === true));
  assert.equal(JSON.parse(await readFile(file, "utf8")).project.measurementsVisible, false);
  assert.equal(JSON.parse(await readFile(historyPathFor(file), "utf8")).undo.length, 10);
});

test("Web App URL 只允许 https 和本地环回 http", async t => {
  const { file, cleanup } = await fixture();
  t.after(cleanup);
  assert.equal(run(file, "url", "--base", "http://localhost:3000/").status, 0);
  const rejected = run(file, "url", "--base", "javascript:alert(1)");
  assert.equal(rejected.status, 3);
  assert.equal(rejected.payload.error.code, "INVALID_URL_PROTOCOL");
});
