import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the ROOMA editor shell and social metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /<title>ROOMA — 3D 室内布局设计<\/title>/i);
  assert.match(html, /3D 室内设计画布/);
  assert.match(html, /主卫改造方案/);
  assert.match(html, /素材库/);
  assert.match(html, /对象尺寸与空间关系/);
  assert.match(html, /property="og:image"/);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("keeps the editor performant, interactive, and responsive", async () => {
  const [page, css, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /powerPreference:\s*"high-performance"/);
  assert.match(page, /Math\.min\(window\.devicePixelRatio, 1\.5\)/);
  assert.match(page, /requestAnimationFrame/);
  assert.match(page, /renderer\.dispose\(\)/);
  assert.match(page, /renderer\.shadowMap\.autoUpdate = false/);
  assert.match(page, /measureSpatialRelationships/);
  assert.match(page, /movementForClearance/);
  assert.match(page, /OrthographicCamera/);
  assert.match(page, /三维尺寸/);
  assert.match(page, /最近空间距离/);
  assert.doesNotMatch(page, /EdgesGeometry/);
  assert.match(page, /TransformControls/);
  assert.match(page, /OrbitControls/);
  assert.match(page, /aria-label="3D 室内设计画布"/);
  assert.match(page, /2D 平面/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(layout, /summary_large_image/);
  assert.match(packageJson, /"three"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
