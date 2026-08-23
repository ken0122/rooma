"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { AXES, measureSpatialRelationships, movementForClearance, type Axis3, type Bounds3, type Clearance, type Point3, type SpatialMetrics } from "@/lib/engine/spatial";
import { RenderScheduler } from "@/lib/engine/render-scheduler";
import { ASSET_CATEGORIES, PARAMETRIC_ASSETS, clampParametricSize, formatAssetSize, getParametricAsset, type AssetCategory } from "@/lib/engine/parametric";

type ToolMode = "translate" | "rotate" | "scale";
type ViewMode = "3D" | "ISO" | "2D";
type ColorMode = "blue" | "red" | "green" | "mono";
type EditorMetrics = SpatialMetrics & { position: Point3; rotationY: number; limits?: { min: Point3; max: Point3 } };
type RenderStats = { calls: number; triangles: number; frameMs: number };
type SceneController = {
  add: (kind: string, label: string) => void;
  duplicate: () => void;
  remove: () => void;
  setTool: (mode: ToolMode) => void;
  setView: (mode: ViewMode) => void;
  setColorMode: (mode: ColorMode) => void;
  setMeasurementsVisible: (visible: boolean) => void;
  setPosition: (axis: Axis3, value: number) => void;
  setRotation: (value: number) => void;
  setDimension: (axis: Axis3, value: number) => void;
  setClearance: (clearance: Clearance, value: number) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
};

const BLUE = 0x2436d8;
const WHITE = 0xffffff;
const COLOR_MODES: Array<{ id: ColorMode; label: string; color: string }> = [
  { id: "blue", label: "蓝色", color: "#2549d8" },
  { id: "red", label: "红色", color: "#df4053" },
  { id: "green", label: "绿色", color: "#2f8763" },
  { id: "mono", label: "无色", color: "#555b61" },
];
const sceneThemes: Record<ColorMode, { ink: number; tint: number; surface: number; background: number; grid: number }> = {
  blue: { ink: 0x2549d8, tint: 0xdce5ff, surface: 0xffffff, background: 0xf7f8fc, grid: 0x8fa5e8 },
  red: { ink: 0xdf4053, tint: 0xffdce1, surface: 0xffffff, background: 0xfff8f8, grid: 0xe9a2ab },
  green: { ink: 0x2f8763, tint: 0xdceee6, surface: 0xffffff, background: 0xf7fbf8, grid: 0x99bfae },
  mono: { ink: 0x555b61, tint: 0xe8e9e7, surface: 0xffffff, background: 0xf7f7f4, grid: 0xb6b8b6 },
};
const ROOM_BOUNDS: Bounds3 = { min: { x: -3, y: 0, z: -2.55 }, max: { x: 3, y: 3.05, z: 2.55 } };
const axisLabels: Record<Axis3, string> = { x: "宽 X", y: "高 Y", z: "深 Z" };
const directionLabels: Record<Clearance["key"], string> = {
  "x-negative": "← 左", "x-positive": "右 →", "y-negative": "↓ 下",
  "y-positive": "上 ↑", "z-negative": "↙ 后", "z-positive": "前 ↗",
};

function IconButton({ label, active, disabled, unavailable, tooltip, children, onClick }: { label: string; active?: boolean; disabled?: boolean; unavailable?: boolean; tooltip?: boolean; children: React.ReactNode; onClick?: () => void }) {
  const button = <button className={`icon-button ${active ? "active" : ""} ${unavailable ? "unavailable" : ""}`} aria-label={label} aria-disabled={unavailable || undefined} title={tooltip ? undefined : label} disabled={disabled} onClick={unavailable ? undefined : onClick}>{children}</button>;
  return tooltip ? <span className="tool-tip" data-tooltip={label}>{button}</span> : button;
}

function MetricInput({ value, unit = "m", min, max, step = 0.05, ariaLabel, onCommit }: { value: number; unit?: string; min?: number; max?: number; step?: number; ariaLabel: string; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(value.toFixed(unit === "°" ? 0 : 2));
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDraft(value.toFixed(unit === "°" ? 0 : 2)));
    return () => cancelAnimationFrame(frame);
  }, [unit, value]);
  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed) && (min === undefined || parsed >= min) && (max === undefined || parsed <= max)) onCommit(parsed);
    else setDraft(value.toFixed(unit === "°" ? 0 : 2));
  };
  return <label className="metric-input"><input aria-label={ariaLabel} inputMode="decimal" min={min} max={max} step={step} type="number" value={draft} onBlur={commit} onChange={event => setDraft(event.target.value)} onKeyDown={event => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") { setDraft(value.toFixed(unit === "°" ? 0 : 2)); event.currentTarget.blur(); }
  }} /><span>{unit}</span></label>;
}

const toBounds3 = (box: THREE.Box3): Bounds3 => ({ min: { x: box.min.x, y: box.min.y, z: box.min.z }, max: { x: box.max.x, y: box.max.y, z: box.max.z } });

export default function Home() {
  const canvasHost = useRef<HTMLDivElement>(null);
  const controller = useRef<SceneController | null>(null);
  const [tool, setTool] = useState<ToolMode>("translate");
  const [view, setView] = useState<ViewMode>("3D");
  const [colorMode, setColorMode] = useState<ColorMode>("blue");
  const [selected, setSelected] = useState("智能马桶");
  const [metrics, setMetrics] = useState<EditorMetrics | null>(null);
  const [renderStats, setRenderStats] = useState<RenderStats>({ calls: 0, triangles: 0, frameMs: 0 });
  const [measurementsVisible, setMeasurementsVisible] = useState(true);
  const [objectCount, setObjectCount] = useState(6);
  const [catalogueOpen, setCatalogueOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [saved, setSaved] = useState(true);
  const [activeCategory, setActiveCategory] = useState<AssetCategory>("furniture");
  const [catalogueQuery, setCatalogueQuery] = useState("");

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (window.innerWidth <= 760) { setCatalogueOpen(false); setInspectorOpen(false); }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const host = canvasHost.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(sceneThemes.blue.background);
    scene.fog = new THREE.Fog(sceneThemes.blue.background, 16, 30);
    const perspectiveCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    perspectiveCamera.position.set(6.8, 5.7, 7.6);
    const orthographicCamera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 100);
    orthographicCamera.position.set(0, 10, 0);
    orthographicCamera.up.set(0, 0, -1);
    orthographicCamera.lookAt(0, 0, 0);
    const isometricCamera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 100);
    isometricCamera.position.set(6.4, 6.4, 6.4);
    isometricCamera.lookAt(0, 1, 0);
    let activeCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera = perspectiveCamera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "scene-canvas";
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls<THREE.Camera>(activeCamera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 1, 0);
    controls.minDistance = 4;
    controls.maxDistance = 16;
    controls.maxPolarAngle = Math.PI * 0.49;
    // Reserve one-finger gestures for selecting objects. Camera pan and pinch-zoom
    // require two fingers so an accidental swipe cannot move the canvas.
    controls.touches.ONE = -1;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    const transform = new TransformControls(activeCamera, renderer.domElement);
    transform.setMode("translate");
    transform.setSize(0.72);
    scene.add(transform.getHelper());

    scene.add(new THREE.HemisphereLight(0xffffff, 0xd9ddff, 2.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(4, 8, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);
    const layout = new THREE.Group();
    layout.name = "layout";
    scene.add(layout);
    const measurementLayer = new THREE.Group();
    measurementLayer.name = "measurements";
    scene.add(measurementLayer);

    const selectable = new Set<THREE.Group>();
    const pickTargets = new Set<THREE.Mesh>();
    const boundsCache = new Map<THREE.Group, THREE.Box3>();
    let current: THREE.Group | null = null;
    let serial = 10;
    let dragging = false;
    let currentColorMode: ColorMode = "blue";
    let measurementTimer: ReturnType<typeof setTimeout> | null = null;
    let lastStatsPublish = 0;
    const undoStack: Array<{ object: THREE.Group; position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 }> = [];
    const redoStack: typeof undoStack = [];
    const HISTORY_LIMIT = 100;
    const geometries = new Map<string, THREE.BufferGeometry>();
    const edgeGeometries = new Map<string, THREE.EdgesGeometry>();
    const geometry = <T extends THREE.BufferGeometry>(key: string, factory: () => T) => {
      const cached = geometries.get(key);
      if (cached) return cached as T;
      const created = factory();
      geometries.set(key, created);
      return created;
    };
    const materials = {
      furniture: new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.72, metalness: 0 }),
      accent: new THREE.MeshStandardMaterial({ color: 0x2f43ec, roughness: 0.65 }),
      wall: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, transparent: true, opacity: 0.22, depthWrite: false }),
      floor: new THREE.MeshStandardMaterial({ color: 0xfdfdff, roughness: 0.96 }),
      plant: new THREE.MeshStandardMaterial({ color: 0x5062e9, roughness: 0.8 }),
      pick: new THREE.MeshBasicMaterial({ visible: false }),
    };
    const sketchLineMaterial = new THREE.LineBasicMaterial({ color: sceneThemes.blue.ink, transparent: true, opacity: 0.9, depthTest: true });

    const addSketchEdges = (mesh: THREE.Mesh) => {
      let edgeGeometry = edgeGeometries.get(mesh.geometry.uuid);
      if (!edgeGeometry) {
        edgeGeometry = new THREE.EdgesGeometry(mesh.geometry, 24);
        edgeGeometries.set(mesh.geometry.uuid, edgeGeometry);
      }
      const edges = new THREE.LineSegments(edgeGeometry, sketchLineMaterial);
      edges.renderOrder = 3;
      mesh.add(edges);
    };

    const renderScheduler = new RenderScheduler({
      requestFrame: window.requestAnimationFrame.bind(window),
      cancelFrame: window.cancelAnimationFrame.bind(window),
      now: performance.now.bind(performance),
      update: () => controls.update(),
      refreshShadows: () => { renderer.shadowMap.needsUpdate = true; },
      render: () => renderer.render(scene, activeCamera),
      onFrame: ({ frameMs }) => {
        const now = performance.now();
        if (now - lastStatsPublish <= 250) return;
        lastStatsPublish = now;
        setRenderStats({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, frameMs });
      },
    });
    const scheduleRender = (withShadows = false) => renderScheduler.invalidate({ shadows: withShadows });

    const box = (w: number, h: number, d: number, x: number, y: number, z: number, parent: THREE.Group, role: "furniture" | "accent" | "wall" = "furniture") => {
      const mesh = new THREE.Mesh(geometry(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d)), materials[role]);
      mesh.position.set(x, y, z);
      mesh.castShadow = role !== "wall";
      mesh.receiveShadow = role !== "wall";
      parent.add(mesh);
      addSketchEdges(mesh);
      return mesh;
    };
    const cylinder = (r: number, h: number, x: number, y: number, z: number, parent: THREE.Group, accent = false) => {
      const mesh = new THREE.Mesh(geometry(`cylinder:${r}:${h}`, () => new THREE.CylinderGeometry(r, r, h, 24)), accent ? materials.accent : materials.furniture);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      addSketchEdges(mesh);
      return mesh;
    };
    const addPickProxy = (group: THREE.Group) => {
      const savedPosition = group.position.clone();
      const savedRotation = group.rotation.clone();
      const savedScale = group.scale.clone();
      group.position.set(0, 0, 0);
      group.rotation.set(0, 0, 0);
      group.scale.set(1, 1, 1);
      group.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(group);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      group.userData.localBounds = {
        min: bounds.min.toArray(),
        max: bounds.max.toArray(),
        size: size.toArray(),
      };
      const proxy = new THREE.Mesh(geometry(`proxy:${size.x.toFixed(3)}:${size.y.toFixed(3)}:${size.z.toFixed(3)}`, () => new THREE.BoxGeometry(size.x, size.y, size.z)), materials.pick);
      proxy.position.copy(center);
      proxy.visible = false;
      proxy.userData.root = group;
      group.add(proxy);
      group.userData.pickProxy = proxy;
      pickTargets.add(proxy);
      group.position.copy(savedPosition);
      group.rotation.copy(savedRotation);
      group.scale.copy(savedScale);
      group.updateMatrixWorld(true);
    };
    const updateBounds = (group: THREE.Group) => {
      group.updateWorldMatrix(true, true);
      const bounds = boundsCache.get(group) ?? new THREE.Box3();
      bounds.setFromObject(group);
      boundsCache.set(group, bounds);
      return bounds;
    };
    const buildParametric = (group: THREE.Group, kind: string, requestedSize: Point3) => {
      const asset = getParametricAsset(kind);
      if (!asset) return;
      const size = clampParametricSize(asset, requestedSize);
      const { x: w, y: h, z: d } = size;
      const t = Math.min(.1, Math.max(.035, Math.min(w, h, d) * .08));
      const leg = Math.min(.09, Math.max(.04, Math.min(w, d) * .08));
      const fourLegs = (legHeight: number, inset = Math.min(w, d) * .12) => {
        for (const x of [-w / 2 + inset, w / 2 - inset]) for (const z of [-d / 2 + inset, d / 2 - inset]) box(leg, legHeight, leg, x, legHeight / 2, z, group);
      };

      if (kind === "door") {
        const frame = Math.min(.09, w * .08);
        box(frame, h, d, -w / 2 + frame / 2, h / 2, 0, group, "accent"); box(frame, h, d, w / 2 - frame / 2, h / 2, 0, group, "accent"); box(w - frame * 2, frame, d, 0, h - frame / 2, 0, group, "accent"); box(w - frame * 2.4, h - frame * 1.7, d * .45, 0, (h - frame) / 2, 0, group);
      } else if (kind === "window") {
        const frame = Math.min(.09, Math.min(w, h) * .09);
        box(frame, h, d, -w / 2 + frame / 2, h / 2, 0, group, "accent"); box(frame, h, d, w / 2 - frame / 2, h / 2, 0, group, "accent"); box(w, frame, d, 0, frame / 2, 0, group, "accent"); box(w, frame, d, 0, h - frame / 2, 0, group, "accent"); box(frame * .7, h - frame * 2, d * .75, 0, h / 2, 0, group, "accent"); box(w - frame * 2, frame * .7, d * .75, 0, h / 2, 0, group, "accent");
      } else if (kind === "partition") {
        box(w, h, d, 0, h / 2, 0, group, "wall"); box(w, t, d, 0, t / 2, 0, group, "accent"); box(t, h, d, -w / 2 + t / 2, h / 2, 0, group, "accent");
      } else if (kind === "sofa" || kind === "armchair") {
        const arm = Math.min(.18, w * .12); const seatH = h * .42; const backD = Math.min(.16, d * .18);
        box(w - arm * 2, seatH * .38, d * .72, 0, seatH, d * .06, group); box(w, h - seatH * .45, backD, 0, seatH + (h - seatH * .45) / 2, -d / 2 + backD / 2, group); box(arm, h * .62, d, -w / 2 + arm / 2, h * .31, 0, group); box(arm, h * .62, d, w / 2 - arm / 2, h * .31, 0, group); box(w - arm * 2.3, t, d * .65, 0, t / 2, d * .03, group);
      } else if (kind === "diningTable") {
        const top = Math.min(.1, h * .13); box(w, top, d, 0, h - top / 2, 0, group); fourLegs(h - top);
      } else if (kind === "bed") {
        const head = Math.min(.16, d * .08); const frameH = Math.min(.35, h * .36); const mattressH = Math.min(.28, h * .28);
        box(w, frameH, d - head, 0, frameH / 2, head / 2, group); box(w * .96, mattressH, d - head * 1.8, 0, frameH + mattressH / 2, head * .35, group); box(w, h, head, 0, h / 2, -d / 2 + head / 2, group, "accent");
      } else if (kind === "wardrobe") {
        box(w, h, d, 0, h / 2, 0, group); const doors = Math.max(1, Math.round(w / .65)); for (let i = 1; i < doors; i++) box(t * .22, h * .94, d * .02, -w / 2 + (w / doors) * i, h / 2, d / 2, group, "accent");
      } else if (kind === "shelf") {
        const side = Math.min(.07, w * .08); box(side, h, d, -w / 2 + side / 2, h / 2, 0, group); box(side, h, d, w / 2 - side / 2, h / 2, 0, group); const levels = Math.max(2, Math.round(h / .42)); for (let i = 0; i <= levels; i++) box(w, t * .55, d, 0, (h / levels) * i, 0, group);
      } else if (kind === "baseCabinet" || kind === "island") {
        const top = Math.min(.08, h * .1); const plinth = Math.min(.1, h * .12); box(w * .95, h - top - plinth, d * .94, 0, plinth + (h - top - plinth) / 2, 0, group); box(w, top, d, 0, h - top / 2, 0, group, "accent"); box(w * .84, plinth, d * .8, 0, plinth / 2, 0, group); const fronts = Math.max(1, Math.round(w / .6)); for (let i = 1; i < fronts; i++) box(t * .18, h * .68, d * .02, -w / 2 + (w / fronts) * i, h * .52, d / 2, group, "accent");
      } else if (kind === "bathtub") {
        const rim = Math.min(.12, Math.min(w, d) * .13); const base = Math.min(.16, h * .28); box(w, base, d, 0, base / 2, 0, group); box(w, h - base, rim, 0, base + (h - base) / 2, -d / 2 + rim / 2, group); box(w, h - base, rim, 0, base + (h - base) / 2, d / 2 - rim / 2, group); box(rim, h - base, d - rim * 2, -w / 2 + rim / 2, base + (h - base) / 2, 0, group); box(rim, h - base, d - rim * 2, w / 2 - rim / 2, base + (h - base) / 2, 0, group);
      } else if (kind === "vanity") {
        const top = Math.min(.1, h * .12); const bodyH = h * .68; box(w * .92, bodyH, d * .88, 0, bodyH / 2 + h * .12, 0, group); box(w, top, d, 0, h - top / 2, 0, group, "accent"); cylinder(Math.min(w * .22, d * .34), top * .7, 0, h - top * .25, 0, group);
      } else if (kind === "toilet") {
        const tankD = d * .34; box(w, h * .72, tankD, 0, h * .36, -d / 2 + tankD / 2, group); const bowlD = d - tankD * .6; box(w * .78, h * .36, bowlD, 0, h * .25, d * .11, group); box(w * .86, h * .09, bowlD * .94, 0, h * .49, d * .11, group, "accent"); box(w * .5, h * .3, d * .48, 0, h * .15, d * .06, group);
      } else if (kind === "stool") {
        const seat = Math.min(.1, h * .18); cylinder(Math.min(w, d) / 2, seat, 0, h - seat / 2, 0, group); fourLegs(h - seat, Math.min(w, d) * .28);
      } else if (kind === "plant") {
        const potH = h * .34; cylinder(Math.min(w, d) * .32, potH, 0, potH / 2, 0, group, true); const leafGeometry = geometry("leaf", () => new THREE.SphereGeometry(1, 10, 7)); for (let i = 0; i < 9; i++) { const leaf = new THREE.Mesh(leafGeometry, materials.plant); leaf.scale.set(w * .11, h * .19, d * .08); leaf.position.set(Math.cos(i * 2.4) * w * .2, h * .72 + (i % 3) * h * .045, Math.sin(i * 2.4) * d * .2); leaf.rotation.z = (i - 4) * .1; leaf.castShadow = true; group.add(leaf); addSketchEdges(leaf); }
      }
      group.userData.parametricSize = size;
    };
    const rebuildObject = (group: THREE.Group, requestedSize: Point3) => {
      const oldProxy = group.userData.pickProxy as THREE.Mesh | undefined;
      if (oldProxy) pickTargets.delete(oldProxy);
      group.clear();
      group.scale.set(1, 1, 1);
      buildParametric(group, group.userData.kind as string, requestedSize);
      group.traverse(child => { child.userData.root = group; });
      addPickProxy(group);
      boundsCache.delete(group);
      updateBounds(group);
    };
    const finishObject = (group: THREE.Group, kind: string, label: string, position: [number, number, number], requestedSize?: Point3) => {
      group.userData = { id: `${kind}-${serial++}`, kind, label, selectable: true };
      buildParametric(group, kind, requestedSize ?? getParametricAsset(kind)?.defaultSize ?? { x: 1, y: 1, z: 1 });
      group.traverse(child => { child.userData.root = group; }); addPickProxy(group); group.position.set(...position); selectable.add(group); layout.add(group); updateBounds(group); return group;
    };
    const makeObject = (kind: string, label: string, position: [number, number, number], requestedSize?: Point3) => finishObject(new THREE.Group(), kind, label, position, requestedSize);

    const floor = new THREE.Mesh(geometry("floor", () => new THREE.PlaneGeometry(6, 5.1)), materials.floor);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; layout.add(floor); addSketchEdges(floor);
    const grid = new THREE.GridHelper(6, 24, BLUE, 0x8190ff); grid.scale.z = 0.85; (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = 0.18; layout.add(grid);
    const architecture = new THREE.Group();
    box(6, 0.08, 0.08, 0, 3.05, -2.55, architecture, "accent"); box(0.08, 3.05, 5.1, -3, 1.53, 0, architecture, "accent"); box(6, 3.05, 0.08, 0, 1.53, -2.55, architecture, "wall"); box(0.08, 3.05, 5.1, -3, 1.53, 0, architecture, "wall"); layout.add(architecture);
    makeObject("bathtub", "嵌入式浴缸", [-0.75, 0, -1.55]); makeObject("vanity", "悬浮洗漱台", [1.9, 0, -1.65]); const toilet = makeObject("toilet", "智能马桶", [1.35, 0, 1.35]); makeObject("wardrobe", "毛巾柜", [-2.5, 0, 1.5], { x: .82, y: 1.7, z: .48 }); makeObject("stool", "浴室凳", [-1.35, 0, 1.25]); makeObject("plant", "绿植", [2.35, 0, 0.65]);

    const clearMeasurementLayer = () => {
      measurementLayer.traverse(object => {
        if (object === measurementLayer) return;
        const renderable = object as THREE.Line | THREE.Sprite;
        if ("geometry" in renderable && renderable.geometry) renderable.geometry.dispose();
        if ("material" in renderable && renderable.material) {
          const list = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
          list.forEach(material => { const map = (material as THREE.SpriteMaterial).map; if (map) map.dispose(); material.dispose(); });
        }
      });
      measurementLayer.clear();
    };
    const labelSprite = (text: string, color: string) => {
      const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 64;
      const context = canvas.getContext("2d");
      if (context) { context.fillStyle = "rgba(255,255,255,.96)"; context.beginPath(); context.roundRect(4, 6, 248, 52, 14); context.fill(); context.strokeStyle = `${color}55`; context.lineWidth = 2; context.stroke(); context.fillStyle = color; context.font = "700 24px Arial"; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(text, 128, 33); }
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true })); sprite.scale.set(0.86, 0.215, 1); sprite.renderOrder = 1000; return sprite;
    };
    const addMeasurementLine = (start: THREE.Vector3, end: THREE.Vector3, color: string, label: string, opacity = 1) => {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest: false })); line.renderOrder = 999; measurementLayer.add(line);
      const sprite = labelSprite(label, color); sprite.position.copy(start).add(end).multiplyScalar(0.5); measurementLayer.add(sprite);
    };
    const drawMeasurements = (object: THREE.Group, box3: THREE.Box3, spatial: SpatialMetrics) => {
      clearMeasurementLayer(); if (!measurementLayer.visible) return;
      const min = box3.min; const max = box3.max; const center = box3.getCenter(new THREE.Vector3());
      const sketchColor = `#${sceneThemes[currentColorMode].ink.toString(16).padStart(6, "0")}`;
      const colors: Record<Axis3, string> = { x: sketchColor, y: sketchColor, z: sketchColor };
      const local = object.userData.localBounds as { min: [number, number, number]; max: [number, number, number] };
      const localMin = new THREE.Vector3().fromArray(local.min);
      const localMax = new THREE.Vector3().fromArray(local.max);
      const offset = (axis: Axis3, amount: number) => amount / Math.max(0.01, Math.abs(object.scale[axis]));
      const worldPoint = (x: number, y: number, z: number) => object.localToWorld(new THREE.Vector3(x, y, z));
      addMeasurementLine(worldPoint(localMin.x, localMax.y + offset("y", 0.16), localMax.z + offset("z", 0.12)), worldPoint(localMax.x, localMax.y + offset("y", 0.16), localMax.z + offset("z", 0.12)), colors.x, `X ${spatial.dimensions.x.toFixed(2)} m`);
      addMeasurementLine(worldPoint(localMax.x + offset("x", 0.16), localMin.y, localMax.z + offset("z", 0.12)), worldPoint(localMax.x + offset("x", 0.16), localMax.y, localMax.z + offset("z", 0.12)), colors.y, `Y ${spatial.dimensions.y.toFixed(2)} m`);
      addMeasurementLine(worldPoint(localMax.x + offset("x", 0.16), localMax.y + offset("y", 0.12), localMin.z), worldPoint(localMax.x + offset("x", 0.16), localMax.y + offset("y", 0.12), localMax.z), colors.z, `Z ${spatial.dimensions.z.toFixed(2)} m`);
      for (const clearance of spatial.clearances) { const start = center.clone(); const end = center.clone(); start[clearance.axis] = clearance.direction === "negative" ? min[clearance.axis] : max[clearance.axis]; end[clearance.axis] = clearance.referenceCoordinate; addMeasurementLine(start, end, colors[clearance.axis], clearance.distance.toFixed(2), 0.62); }
    };
    const getMetrics = (object: THREE.Group) => {
      const selectedBox = updateBounds(object);
      const obstacles = [...selectable].filter(candidate => candidate !== object).map(candidate => ({ id: candidate.userData.id as string, label: candidate.userData.label as string, bounds: toBounds3(boundsCache.get(candidate) ?? updateBounds(candidate)) }));
      const spatial = measureSpatialRelationships(toBounds3(selectedBox), obstacles, ROOM_BOUNDS);
      const semanticSize = object.userData.parametricSize as Point3 | undefined;
      const baseSize = (object.userData.localBounds as { size: [number, number, number] }).size;
      spatial.dimensions = semanticSize ?? { x: baseSize[0], y: baseSize[1], z: baseSize[2] };
      return { selectedBox, spatial };
    };
    const refreshMeasurements = () => {
      measurementTimer = null;
      if (!current) { clearMeasurementLayer(); setMetrics(null); return; }
      const { selectedBox, spatial } = getMetrics(current); drawMeasurements(current, selectedBox, spatial);
      const definition = getParametricAsset(current.userData.kind as string);
      setMetrics({ ...spatial, position: { x: current.position.x, y: current.position.y, z: current.position.z }, rotationY: THREE.MathUtils.radToDeg(current.rotation.y), limits: definition ? { min: definition.minSize, max: definition.maxSize } : undefined }); scheduleRender(false);
    };
    const scheduleMeasurementRefresh = (immediate = false) => { if (measurementTimer) clearTimeout(measurementTimer); if (immediate) refreshMeasurements(); else measurementTimer = setTimeout(refreshMeasurements, 70); };
    const select = (object: THREE.Group | null) => { current = object; if (object) { transform.attach(object); setSelected(object.userData.label || "未命名对象"); } else { transform.detach(); setSelected("未选择对象"); } scheduleMeasurementRefresh(true); scheduleRender(false); };

    const snapshot = (object: THREE.Group) => ({ object, position: object.position.clone(), rotation: object.rotation.clone(), scale: object.scale.clone(), size: { ...(object.userData.parametricSize as Point3) } });
    const pushUndo = (object: THREE.Group) => { undoStack.push(snapshot(object)); if (undoStack.length > HISTORY_LIMIT) undoStack.shift(); };
    const restore = (state: ReturnType<typeof snapshot>) => { rebuildObject(state.object, state.size); state.object.position.copy(state.position); state.object.rotation.copy(state.rotation); state.object.scale.copy(state.scale); updateBounds(state.object); select(state.object); scheduleRender(true); setSaved(false); };
    const mutateCurrent = (mutation: (object: THREE.Group) => void) => { if (!current) return; pushUndo(current); redoStack.length = 0; mutation(current); updateBounds(current); scheduleMeasurementRefresh(true); scheduleRender(true); setSaved(false); };

    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    const touchPointers = new Set<number>();
    let touchStartPoint: { x: number; y: number } | null = null;
    let touchMoved = false;
    let touchGestureHadMultiple = false;
    const pickAt = (event: PointerEvent) => { const rect = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); raycaster.setFromCamera(pointer, activeCamera); const hit = raycaster.intersectObjects([...pickTargets], false)[0]; select((hit?.object.userData.root as THREE.Group | undefined) || null); };
    const onPointerDown = (event: PointerEvent) => {
      renderer.domElement.focus({ preventScroll: true });
      if (event.pointerType === "touch") {
        if (touchPointers.size === 0) { touchStartPoint = { x: event.clientX, y: event.clientY }; touchMoved = false; touchGestureHadMultiple = false; }
        touchPointers.add(event.pointerId);
        if (touchPointers.size > 1) touchGestureHadMultiple = true;
        return;
      }
      if (!dragging) pickAt(event);
    };
    const onPointerMove = (event: PointerEvent) => { if (event.pointerType !== "touch" || !touchStartPoint) return; if (Math.hypot(event.clientX - touchStartPoint.x, event.clientY - touchStartPoint.y) > 8) touchMoved = true; };
    const onPointerEnd = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      touchPointers.delete(event.pointerId);
      if (touchPointers.size > 0) return;
      if (!dragging && !touchGestureHadMultiple && !touchMoved) pickAt(event);
      touchStartPoint = null; touchMoved = false; touchGestureHadMultiple = false;
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerEnd);
    renderer.domElement.addEventListener("pointercancel", onPointerEnd);
    transform.addEventListener("dragging-changed", event => { dragging = Boolean(event.value); controls.enabled = !dragging; if (dragging && current) pushUndo(current); if (!dragging) { redoStack.length = 0; scheduleMeasurementRefresh(true); } scheduleRender(dragging); });
    transform.addEventListener("objectChange", () => { if (current) updateBounds(current); setSaved(false); scheduleMeasurementRefresh(false); scheduleRender(true); });
    controls.addEventListener("change", () => scheduleRender(false));

    const onResize = () => { const width = host.clientWidth; const height = host.clientHeight; if (!width || !height) return; const aspect = width / height; perspectiveCamera.aspect = aspect; perspectiveCamera.updateProjectionMatrix(); const viewHeight = 6.8; for (const camera of [orthographicCamera, isometricCamera]) { camera.left = -(viewHeight * aspect) / 2; camera.right = (viewHeight * aspect) / 2; camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2; camera.updateProjectionMatrix(); } renderer.setSize(width, height, false); scheduleRender(false); };
    const resizeObserver = new ResizeObserver(onResize); resizeObserver.observe(host);

    const api: SceneController = {
      add: (kind, label) => { const object = makeObject(kind, label, [0.25 + (serial % 3) * 0.35, 0, 0.25]); select(object); setObjectCount(selectable.size); setSaved(false); scheduleRender(true); },
      duplicate: () => { if (!current) return; const source = current; const object = makeObject(source.userData.kind, `${source.userData.label} 副本`, [source.position.x + 0.25, source.position.y, source.position.z + 0.25], { ...(source.userData.parametricSize as Point3) }); object.rotation.copy(source.rotation); select(object); setObjectCount(selectable.size); setSaved(false); scheduleRender(true); },
      remove: () => { if (!current) return; const removed = current; transform.detach(); selectable.delete(removed); pickTargets.delete(removed.userData.pickProxy); boundsCache.delete(removed); layout.remove(removed); for (let i = undoStack.length - 1; i >= 0; i--) if (undoStack[i].object === removed) undoStack.splice(i, 1); for (let i = redoStack.length - 1; i >= 0; i--) if (redoStack[i].object === removed) redoStack.splice(i, 1); current = null; setSelected("未选择对象"); setMetrics(null); clearMeasurementLayer(); setObjectCount(selectable.size); setSaved(false); scheduleRender(true); },
      setTool: mode => { transform.setMode(mode); scheduleRender(false); },
      setView: mode => { activeCamera = mode === "2D" ? orthographicCamera : mode === "ISO" ? isometricCamera : perspectiveCamera; controls.object = activeCamera; transform.camera = activeCamera; if (mode === "2D") { orthographicCamera.position.set(0, 10, 0); orthographicCamera.zoom = 1; orthographicCamera.updateProjectionMatrix(); controls.target.set(0, 0, 0); controls.enableRotate = false; } else if (mode === "ISO") { isometricCamera.position.set(6.4, 6.4, 6.4); isometricCamera.zoom = 1; isometricCamera.updateProjectionMatrix(); controls.target.set(0, 1, 0); controls.enableRotate = false; } else { perspectiveCamera.position.set(6.8, 5.7, 7.6); controls.target.set(0, 1, 0); controls.enableRotate = true; } controls.update(); scheduleRender(false); },
      setColorMode: mode => { currentColorMode = mode; const theme = sceneThemes[mode]; scene.background = new THREE.Color(theme.background); if (scene.fog instanceof THREE.Fog) scene.fog.color.setHex(theme.background); materials.furniture.color.setHex(theme.surface); materials.floor.color.setHex(theme.surface); materials.accent.color.setHex(theme.ink); materials.wall.color.setHex(theme.surface); materials.plant.color.setHex(theme.tint); sketchLineMaterial.color.setHex(theme.ink); const gridMaterial = grid.material as THREE.LineBasicMaterial | THREE.LineBasicMaterial[]; const gridList = Array.isArray(gridMaterial) ? gridMaterial : [gridMaterial]; gridList.forEach((material, index) => { material.color.setHex(index === 0 ? theme.ink : theme.grid); material.opacity = index === 0 ? 0.34 : 0.16; }); scheduleMeasurementRefresh(true); scheduleRender(true); },
      setMeasurementsVisible: visible => { measurementLayer.visible = visible; scheduleMeasurementRefresh(true); },
      setPosition: (axis, value) => mutateCurrent(object => { object.position[axis] = value; }),
      setRotation: value => mutateCurrent(object => { object.rotation.y = THREE.MathUtils.degToRad(value); }),
      setDimension: (axis, value) => mutateCurrent(object => { const before = new THREE.Box3().setFromObject(object); const currentSize = object.userData.parametricSize as Point3; rebuildObject(object, { ...currentSize, [axis]: value }); const after = new THREE.Box3().setFromObject(object); if (axis === "y") object.position.y += before.min.y - after.min.y; }),
      setClearance: (clearance, value) => mutateCurrent(object => { const latest = getMetrics(object).spatial.clearances.find(item => item.key === clearance.key); if (latest) object.position[clearance.axis] += movementForClearance(latest, value); }),
      undo: () => { const state = undoStack.pop(); if (!state || !selectable.has(state.object)) return; redoStack.push(snapshot(state.object)); restore(state); },
      redo: () => { const state = redoStack.pop(); if (!state || !selectable.has(state.object)) return; pushUndo(state.object); restore(state); },
      reset: () => { if (activeCamera === orthographicCamera) { orthographicCamera.position.set(0, 10, 0); orthographicCamera.zoom = 1; orthographicCamera.updateProjectionMatrix(); controls.target.set(0, 0, 0); } else if (activeCamera === isometricCamera) { isometricCamera.position.set(6.4, 6.4, 6.4); isometricCamera.zoom = 1; isometricCamera.updateProjectionMatrix(); controls.target.set(0, 1, 0); } else { perspectiveCamera.position.set(6.8, 5.7, 7.6); controls.target.set(0, 1, 0); } controls.update(); scheduleRender(false); },
    };
    controller.current = api; select(toilet); onResize();
    const onKeyDown = (event: KeyboardEvent) => { if (event.target instanceof HTMLInputElement) return; const key = event.key.toLowerCase(); if (key === "delete" || key === "backspace") api.remove(); if (key === "g") { setTool("translate"); api.setTool("translate"); } if (key === "r") { setTool("rotate"); api.setTool("rotate"); } if (key === "z" && (event.metaKey || event.ctrlKey)) { if (event.shiftKey) api.redo(); else api.undo(); } };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown); renderer.domElement.removeEventListener("pointerdown", onPointerDown); renderer.domElement.removeEventListener("pointermove", onPointerMove); renderer.domElement.removeEventListener("pointerup", onPointerEnd); renderer.domElement.removeEventListener("pointercancel", onPointerEnd); resizeObserver.disconnect(); renderScheduler.dispose(); if (measurementTimer) clearTimeout(measurementTimer); clearMeasurementLayer(); controls.dispose(); transform.dispose();
      const disposedGeometries = new Set<THREE.BufferGeometry>(); const disposedMaterials = new Set<THREE.Material>();
      scene.traverse(object => { const renderable = object as THREE.Mesh | THREE.Line | THREE.Sprite; if ("geometry" in renderable && renderable.geometry && !disposedGeometries.has(renderable.geometry)) { disposedGeometries.add(renderable.geometry); renderable.geometry.dispose(); } if ("material" in renderable && renderable.material) { const list = Array.isArray(renderable.material) ? renderable.material : [renderable.material]; list.forEach(material => { if (disposedMaterials.has(material)) return; disposedMaterials.add(material); const map = (material as THREE.MeshStandardMaterial).map; if (map) map.dispose(); material.dispose(); }); } });
      renderer.dispose(); renderer.domElement.remove(); controller.current = null;
    };
  }, []);

  const changeTool = (next: ToolMode) => { setTool(next); controller.current?.setTool(next); };
  const changeView = (next: ViewMode) => { setView(next); controller.current?.setView(next); };
  const changeColorMode = (next: ColorMode) => { setColorMode(next); controller.current?.setColorMode(next); };
  const toggleMeasurements = () => { const next = !measurementsVisible; setMeasurementsVisible(next); controller.current?.setMeasurementsVisible(next); };
  const toggleCatalogue = () => setCatalogueOpen(value => { const next = !value; if (next && window.innerWidth <= 760) setInspectorOpen(false); return next; });
  const toggleInspector = () => setInspectorOpen(value => { const next = !value; if (next && window.innerWidth <= 760) setCatalogueOpen(false); return next; });
  const normalizedQuery = catalogueQuery.trim().toLowerCase();
  const visibleAssets = PARAMETRIC_ASSETS.filter(asset => asset.category === activeCategory && (!normalizedQuery || `${asset.label} ${asset.kind}`.toLowerCase().includes(normalizedQuery)));

  return <main className={`app-shell ${catalogueOpen ? "" : "catalogue-closed"} ${inspectorOpen ? "" : "inspector-collapsed"}`} data-color-mode={colorMode}>
    {/* THESIS: A working architectural model, not a dashboard; the room itself leads. OWN-WORLD: White drafting surface, single-color edges, sparse same-hue fills, precise compact controls. STORY: Choose an asset on the left, compose it on the canvas, then edit its properties on the right. FIRST VIEWPORT: A three-pane workbench with a left asset catalogue, central room canvas, right object inspector, and common tools in the topbar. FORM: SketchUp-style operating surface, pinned by the user's references; orthographic isometric staging. */}
    <header className="topbar"><div className="brand"><span className="brand-mark">R</span><span>ROOMA</span></div><div className="project-title"><span className="status-dot" />主卫改造方案 <button aria-label="重命名项目">⌄</button></div><nav className="top-tools" aria-label="常用设计工具"><IconButton tooltip label="选择对象" active>↖</IconButton><span className="tool-divider" /><IconButton tooltip label="移动对象 · G" active={tool === "translate"} onClick={() => changeTool("translate")}>✣</IconButton><IconButton tooltip label="旋转对象 · R" active={tool === "rotate"} onClick={() => changeTool("rotate")}>⟳</IconButton><IconButton tooltip label="参数化尺寸请在右侧属性栏编辑" unavailable>↗</IconButton><span className="tool-divider" /><IconButton tooltip label="墙体工具 · 开发中" unavailable>▰</IconButton><IconButton tooltip label="门窗工具 · 开发中" unavailable>▯</IconButton><IconButton tooltip label="显示或隐藏空间标注" active={measurementsVisible} onClick={toggleMeasurements}>⌁</IconButton><IconButton tooltip label="快捷键：G 移动、R 旋转、Delete 删除">?</IconButton></nav><div className="top-actions"><span className={`save-state ${saved ? "saved" : ""}`}>{saved ? "已自动保存" : "有未保存更改"}</span><IconButton label="撤销" onClick={() => controller.current?.undo()}>↶</IconButton><IconButton label="重做" onClick={() => controller.current?.redo()}>↷</IconButton><button className="share-button" onClick={() => setSaved(true)}>保存方案</button><button className="avatar" aria-label="账户">LK</button></div></header>
    <aside className={`catalogue ${catalogueOpen ? "open" : "closed"}`} aria-label="参数化素材"><button className="catalogue-toggle" onClick={toggleCatalogue} aria-expanded={catalogueOpen} aria-label="展开或收起标模库">{catalogueOpen ? "‹" : "›"}</button>{catalogueOpen && <div className="catalogue-content"><div className="panel-heading"><div><span>参数化标模</span><small>选择置入 · 尺寸可编辑</small></div><span className="asset-count">{PARAMETRIC_ASSETS.length}</span></div><label className="catalogue-search"><span>⌕</span><input value={catalogueQuery} onChange={event => setCatalogueQuery(event.target.value)} placeholder="搜索标模" aria-label="搜索标模" /></label><div className="category-tabs" role="tablist" aria-label="标模分类">{ASSET_CATEGORIES.map(category => <button role="tab" aria-selected={activeCategory === category.id} className={activeCategory === category.id ? "active" : ""} key={category.id} onClick={() => setActiveCategory(category.id)}>{category.label}</button>)}</div><div className="asset-list">{visibleAssets.map(item => <button className="asset-row" key={item.kind} onClick={() => controller.current?.add(item.kind, item.label)}><span className="asset-icon">{item.icon}</span><span className="asset-copy"><b>{item.label}</b><small>{formatAssetSize(item.defaultSize)}</small></span><span className="parametric-badge">参数化</span><i>＋</i></button>)}{visibleAssets.length === 0 && <div className="asset-empty">没有匹配的标模</div>}</div><button className="upload-asset" disabled title="下一阶段支持 GLB / glTF">＋ 导入自定义模型</button></div>}</aside>
    <section className="workspace" aria-label="3D 室内设计画布"><div ref={canvasHost} className="canvas-host" /><div className="display-controls"><div className="view-switch" role="group" aria-label="视图模式"><button className={view === "2D" ? "active" : ""} onClick={() => changeView("2D")}>2D 平面</button><button className={view === "ISO" ? "active" : ""} onClick={() => changeView("ISO")}>等轴测</button><button className={view === "3D" ? "active" : ""} onClick={() => changeView("3D")}>3D 空间</button></div><div className="color-switch" role="group" aria-label="模型颜色模式"><span>线稿</span>{COLOR_MODES.map(mode => <button key={mode.id} className={colorMode === mode.id ? "active" : ""} onClick={() => changeColorMode(mode.id)} aria-label={`${mode.label}模式`} aria-pressed={colorMode === mode.id}><i style={{ background: mode.color }} /><b>{mode.label}</b></button>)}</div></div><button className="reset-view" onClick={() => controller.current?.reset()} aria-label="重置视角">⌂</button><div className="room-meta"><span>主卫</span><b>18.6 m²</b><small>{objectCount} 个对象 · 3.05 m 层高</small></div><div className="touch-hint" aria-label="触控提示">双指平移 · 捏合缩放</div><div className="performance-pill" title={`最近一帧 CPU 提交 ${renderStats.frameMs.toFixed(1)} ms`}><span /> 按需渲染 · {renderStats.calls} calls · {renderStats.triangles.toLocaleString()} tris</div></section>
    <section className={`inspector ${inspectorOpen ? "open" : "collapsed"}`} aria-label="选中对象属性"><div className="selection-title"><span>当前选择 · 参数化标模</span><b>{selected}</b><small>输入数值后按 Enter 或点击外部应用</small><button className="inspector-toggle" onClick={toggleInspector} aria-expanded={inspectorOpen}>{inspectorOpen ? "收起" : "属性"}</button></div>{metrics ? <>
      <div className="inspector-section"><h3>位置与旋转</h3><div className="metric-grid position-grid">{AXES.map(axis => <div className="metric-cell" key={axis}><span>{axis.toUpperCase()}</span><MetricInput ariaLabel={`${axis.toUpperCase()} 位置`} value={metrics.position[axis]} onCommit={value => controller.current?.setPosition(axis, value)} /></div>)}<div className="metric-cell"><span>旋转 Y</span><MetricInput ariaLabel="Y 轴旋转" unit="°" step={1} value={metrics.rotationY} onCommit={value => controller.current?.setRotation(value)} /></div></div></div>
      <div className="inspector-section"><div className="section-heading"><h3>三维尺寸</h3><span>结构随尺寸自动重建</span></div><div className="metric-grid dimension-grid">{AXES.map(axis => <div className={`metric-cell axis-${axis}`} key={axis}><span>{axisLabels[axis]}</span><MetricInput ariaLabel={`${axisLabels[axis]}尺寸`} min={metrics.limits?.min[axis] ?? .01} max={metrics.limits?.max[axis]} value={metrics.dimensions[axis]} onCommit={value => controller.current?.setDimension(axis, value)} /></div>)}</div><p className="parametric-note">构件细节与常用比例保持不变，不会被拉伸变形。</p></div>
      <div className="inspector-section clearance-section"><div className="section-heading"><h3>最近空间距离</h3><span>参照墙体或物体</span></div><div className="clearance-grid">{metrics.clearances.map(clearance => <div className={`clearance-cell axis-${clearance.axis}`} key={clearance.key}><div><b>{directionLabels[clearance.key]}</b><small>{clearance.referenceLabel}</small></div><MetricInput ariaLabel={`${directionLabels[clearance.key]}到${clearance.referenceLabel}的距离`} min={0} value={clearance.distance} onCommit={value => controller.current?.setClearance(clearance, value)} /></div>)}</div></div>
    </> : <div className="inspector-empty">选择一个物体以查看尺寸和空间距离</div>}<div className="property-actions"><button onClick={() => controller.current?.remove()}>删除对象</button><button onClick={() => controller.current?.duplicate()}>复制对象</button></div></section>
  </main>;
}
