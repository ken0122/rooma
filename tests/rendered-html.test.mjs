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
  assert.match(html, /参数化标模/);
  assert.match(html, /选择置入 · 尺寸可编辑/);
  assert.doesNotMatch(html, /选中对象属性/);
  assert.match(html, /常用设计工具/);
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
  assert.match(page, /buildParametric/);
  assert.match(page, /rebuildObject/);
  assert.match(page, /结构随尺寸自动重建/);
  assert.match(page, /OrthographicCamera/);
  assert.match(page, /三维尺寸/);
  assert.match(page, /最近空间距离/);
  assert.match(page, /edgeGeometries = new Map/);
  assert.match(page, /new THREE\.EdgesGeometry/);
  assert.match(page, /sketchLineMaterial/);
  assert.match(page, /TransformControls/);
  assert.match(page, /OrbitControls/);
  assert.match(page, /viewControls\.touches\.ONE = null/);
  assert.match(page, /viewControls\.touches\.TWO = THREE\.TOUCH\.DOLLY_PAN/);
  assert.match(page, /touchGestureHadMultiple/);
  assert.match(page, /双指平移 · 捏合缩放/);
  assert.match(page, /loadRoomaProjectFromBrowser/);
  assert.match(page, /persistRoomaProject/);
  assert.match(page, /hashchange/);
  assert.match(page, /className="top-tools"/);
  assert.match(page, /data-tooltip/);
  assert.match(page, /event\.code === "Space"/);
  assert.match(page, /key === "1" \? "2D" : key === "2" \? "3D" : key === "3" \? "ISO"/);
  assert.match(page, /viewControls\.mouseButtons\.LEFT = rotationEnabled \? THREE\.MOUSE\.ROTATE : THREE\.MOUSE\.PAN/);
  assert.match(page, /viewControls\.minZoom = 0\.55/);
  assert.match(page, /viewControls\.maxZoom = 3/);
  assert.match(page, /controlsByView: Record<ViewMode, OrbitControls<THREE\.Camera>>/);
  assert.match(page, /controls = controlsByView\[mode\]/);
  assert.match(page, /if \(mode === currentViewMode && nextCamera === activeCamera\) return/);
  assert.match(page, /key === "t"/);
  assert.match(page, /key === "h"/);
  assert.match(page, /ariaShortcut="T"/);
  assert.match(page, /ariaShortcut="H"/);
  assert.match(page, /className="view-icons"/);
  assert.match(page, /className="color-swatches"/);
  assert.match(page, /new THREE\.Box3Helper/);
  assert.match(page, /new THREE\.AxesHelper/);
  assert.match(page, /rooma:inspector/);
  assert.match(page, /hasSelection && <section/);
  assert.match(page, /inspector-hidden/);
  assert.doesNotMatch(page, /参数化尺寸请在右侧属性栏编辑|快捷键：G 移动|墙体工具|门窗工具/);
  assert.match(page, /本地已保存/);
  assert.match(page, /恢复原草稿/);
  assert.match(page, /<ul className="scene-object-list" aria-label="场景对象">/);
  assert.match(page, /aria-pressed=\{selectedObject\?\.id === object\.id\}/);
  assert.match(page, /className="room-switcher" aria-label="当前房间"/);
  assert.doesNotMatch(page, /aria-label="切换房间"|onChange=\{\(\) => undefined\}/);
  assert.match(page, /spatial-warning/);
  assert.doesNotMatch(page, /保存方案|已自动保存|className="brand-mark"|className="reset-view"/);
  assert.match(css, /\.app-shell\.inspector-collapsed, \.app-shell\.inspector-hidden \{ grid-template-columns: 290px minmax\(0, 1fr\)/);
  assert.match(css, /\.inspector \{ position: fixed; top: 82px; right: 18px/);
  assert.doesNotMatch(page, /className="toolrail"/);
  assert.ok(page.indexOf("className={`catalogue") < page.indexOf("className=\"workspace\""));
  assert.ok(page.indexOf("className=\"workspace\"") < page.indexOf("className={`inspector"));
  assert.match(page, /aria-label="3D 室内设计画布"/);
  assert.match(page, /2D 平面/);
  assert.match(page, /等轴测/);
  assert.match(page, /左键环绕 · 右键平移 · 滚轮缩放/);
  assert.match(page, /className="view-guidance" role="status" aria-live="polite"/);
  assert.match(page, /蓝色.*红色.*绿色.*无色/s);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.scene-object-list button \{ min-height: 44px; \}/);
  assert.match(css, /\.catalogue \{ grid-column: 1/);
  assert.match(css, /\.workspace \{ grid-column: 2/);
  assert.doesNotMatch(css, /\.inspector \{ grid-column: 3/);
  assert.match(layout, /summary_large_image/);
  assert.match(packageJson, /"three"/);
  assert.match(packageJson, /"typecheck"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
