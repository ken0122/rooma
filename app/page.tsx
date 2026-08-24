"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { AXES, measureSpatialRelationships, movementForClearance, type Axis3, type Bounds3, type Clearance, type Point3, type SpatialMetrics } from "@/lib/engine/spatial";
import { RenderScheduler } from "@/lib/engine/render-scheduler";
import { ProjectHistory } from "@/lib/engine/project-history";
import { ASSET_CATEGORIES, PARAMETRIC_ASSETS, clampParametricSize, formatAssetSize, getParametricAsset, type AssetCategory } from "@/lib/engine/parametric";
import { DEFAULT_PROJECT, loadRoomaProjectFromBrowser, persistRoomaProject, restoreRoomaProjectBackupFromBrowser, type RoomaColorMode, type RoomaObject, type RoomaProject, type RoomaView } from "@/lib/project";
import { boundsForSizedObject, spatialIssuesForObject } from "@/lib/project-domain.js";

type ToolMode = "select" | "translate" | "rotate";
type ViewMode = RoomaView;
type ColorMode = RoomaColorMode;
type EditorMetrics = SpatialMetrics & { position: Point3; rotationY: number; limits?: { min: Point3; max: Point3 }; issues: string[] };
type SceneController = {
  add: (kind: string, label: string) => void;
  duplicate: () => void;
  remove: () => void;
  setTool: (mode: ToolMode) => void;
  setView: (mode: ViewMode) => void;
  setColorMode: (mode: ColorMode) => void;
  setMeasurementsVisible: (visible: boolean) => void;
  setFocusMode: (active: boolean) => void;
  setPosition: (axis: Axis3, value: number) => void;
  setRotation: (value: number) => void;
  setDimension: (axis: Axis3, value: number) => void;
  setClearance: (clearance: Clearance, value: number) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  selectById: (id: string) => void;
};

const BLUE = 0x2436d8;
const WHITE = 0xffffff;
const COLOR_MODES: Array<{ id: ColorMode; label: string; color: string }> = [
  { id: "blue", label: "蓝色", color: "#2549d8" },
  { id: "red", label: "红色", color: "#df4053" },
  { id: "green", label: "绿色", color: "#2f8763" },
  { id: "mono", label: "无色", color: "#555b61" },
];
const VIEW_INTERACTIONS: Record<ViewMode, { label: string; shortcut: string; pointerHint: string; touchHint: string }> = {
  "2D": { label: "2D 平面", shortcut: "1", pointerHint: "左键拖动平移 · 滚轮缩放", touchHint: "双指平移 · 捏合缩放" },
  "3D": { label: "3D 透视", shortcut: "2", pointerHint: "左键环绕 · 右键平移 · 滚轮缩放", touchHint: "双指平移 · 捏合缩放" },
  ISO: { label: "等轴测", shortcut: "3", pointerHint: "左键拖动平移 · 滚轮缩放", touchHint: "双指平移 · 捏合缩放" },
};
const sceneThemes: Record<ColorMode, { ink: number; tint: number; surface: number; background: number; grid: number }> = {
  blue: { ink: 0x2549d8, tint: 0xdce5ff, surface: 0xffffff, background: 0xf7f8fc, grid: 0x8fa5e8 },
  red: { ink: 0xdf4053, tint: 0xffdce1, surface: 0xffffff, background: 0xfff8f8, grid: 0xe9a2ab },
  green: { ink: 0x2f8763, tint: 0xdceee6, surface: 0xffffff, background: 0xf7fbf8, grid: 0x99bfae },
  mono: { ink: 0x555b61, tint: 0xe8e9e7, surface: 0xffffff, background: 0xf7f7f4, grid: 0xb6b8b6 },
};
const axisLabels: Record<Axis3, string> = { x: "宽 X", y: "高 Y", z: "深 Z" };
const directionLabels: Record<Clearance["key"], string> = {
  "x-negative": "← 左", "x-positive": "右 →", "y-negative": "↓ 下",
  "y-positive": "上 ↑", "z-negative": "↙ 后", "z-positive": "前 ↗",
};

function IconButton({ label, shortcut, ariaShortcut, active, disabled = false, children, onClick }: { label: string; shortcut: string; ariaShortcut?: string; active?: boolean; disabled?: boolean; children: React.ReactNode; onClick: () => void }) {
  const tooltip = `${label} · ${shortcut}`;
  return <span className="tool-tip" data-tooltip={tooltip}><button className={`icon-button ${active ? "active" : ""}`} aria-label={tooltip} aria-keyshortcuts={ariaShortcut} aria-pressed={active} title={tooltip} disabled={disabled} onClick={onClick}>{children}</button></span>;
}

function ViewButton({ label, shortcut, active, children, onClick }: { label: string; shortcut: string; active: boolean; children: React.ReactNode; onClick: () => void }) {
  const tooltip = `${label} · ${shortcut}`;
  return <span className="tool-tip display-tip" data-tooltip={tooltip}><button className={`display-button ${active ? "active" : ""}`} aria-label={tooltip} aria-keyshortcuts={shortcut} aria-pressed={active} title={tooltip} onClick={onClick}>{children}</button></span>;
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
  const [tool, setTool] = useState<ToolMode>("select");
  const [view, setView] = useState<ViewMode>(DEFAULT_PROJECT.project.view);
  const [colorMode, setColorMode] = useState<ColorMode>(DEFAULT_PROJECT.project.colorMode);
  const initialSelected = DEFAULT_PROJECT.objects.find(object => object.id === DEFAULT_PROJECT.project.selectedObjectId) ?? null;
  const [selectedObject, setSelectedObject] = useState<{ id: string; label: string } | null>(initialSelected ? { id: initialSelected.id, label: initialSelected.label } : null);
  const [projectName, setProjectName] = useState(DEFAULT_PROJECT.project.name);
  const [roomInfo, setRoomInfo] = useState(DEFAULT_PROJECT.project.room);
  const [metrics, setMetrics] = useState<EditorMetrics | null>(null);
  const [measurementsVisible, setMeasurementsVisible] = useState(DEFAULT_PROJECT.project.measurementsVisible);
  const [objectCount, setObjectCount] = useState(DEFAULT_PROJECT.objects.length);
  const [catalogueOpen, setCatalogueOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const inspectorOpenPreference = useRef(inspectorOpen);
  const [activeCategory, setActiveCategory] = useState<AssetCategory>("furniture");
  const [catalogueQuery, setCatalogueQuery] = useState("");
  const [sceneObjects, setSceneObjects] = useState(DEFAULT_PROJECT.objects.map(({ id, label }) => ({ id, label })));
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "error">("saved");
  const [saveMessage, setSaveMessage] = useState("本地已保存");
  const [projectNotice, setProjectNotice] = useState<string | null>(null);
  const [backupAvailable, setBackupAvailable] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const savedInspectorOpen = window.localStorage.getItem("rooma:inspector") !== "collapsed";
        inspectorOpenPreference.current = savedInspectorOpen;
        setInspectorOpen(savedInspectorOpen);
      } catch {
        setSaveState("error");
        setSaveMessage("本地保存不可用");
        setProjectNotice("浏览器存储不可用，本次编辑可能无法在刷新后恢复。");
      }
      if (window.innerWidth <= 760) setCatalogueOpen(false);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const reloadProjectFromHash = () => window.location.reload();
    window.addEventListener("hashchange", reloadProjectFromHash);
    return () => window.removeEventListener("hashchange", reloadProjectFromHash);
  }, []);

  useEffect(() => {
    const keepMobileCanvasVisible = () => {
      if (window.innerWidth <= 760 && selectedObject && inspectorOpen) setCatalogueOpen(false);
    };
    keepMobileCanvasVisible();
    window.addEventListener("resize", keepMobileCanvasVisible);
    return () => window.removeEventListener("resize", keepMobileCanvasVisible);
  }, [inspectorOpen, selectedObject]);

  useEffect(() => {
    const host = canvasHost.current;
    if (!host) return;

    const loadedProject = loadRoomaProjectFromBrowser();
    const initialProject = loadedProject.project;
    const room = initialProject.project.room;
    const roomBounds: Bounds3 = { min: { x: -room.width / 2, y: 0, z: -room.depth / 2 }, max: { x: room.width / 2, y: room.height, z: room.depth / 2 } };
    setProjectName(initialProject.project.name);
    setRoomInfo(room);
    setView(initialProject.project.view);
    setColorMode(initialProject.project.colorMode);
    setMeasurementsVisible(initialProject.project.measurementsVisible);
    setObjectCount(initialProject.objects.length);
    setSceneObjects(initialProject.objects.map(({ id, label }) => ({ id, label })));
    setProjectNotice(loadedProject.notice ?? (loadedProject.repairs.length ? `工程载入时修复了 ${loadedProject.repairs.length} 项数据。` : null));
    setBackupAvailable(loadedProject.backupAvailable);
    const storageStatusFrame = loadedProject.storageError ? requestAnimationFrame(() => { setSaveState("error"); setSaveMessage("本地保存不可用"); }) : 0;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(sceneThemes[initialProject.project.colorMode].background);
    scene.fog = new THREE.Fog(sceneThemes[initialProject.project.colorMode].background, 16, 30);
    const perspectiveCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    perspectiveCamera.position.set(6.8, 5.7, 7.6);
    const orthographicCamera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 100);
    orthographicCamera.position.set(0, 10, 0);
    orthographicCamera.up.set(0, 0, -1);
    orthographicCamera.lookAt(0, 0, 0);
    const isometricCamera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 100);
    isometricCamera.position.set(6.4, 6.4, 6.4);
    isometricCamera.lookAt(0, 1, 0);
    const camerasByView: Record<ViewMode, THREE.PerspectiveCamera | THREE.OrthographicCamera> = { "2D": orthographicCamera, "3D": perspectiveCamera, ISO: isometricCamera };
    let activeCamera = camerasByView[initialProject.project.view];

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "scene-canvas";
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);

    const makeViewControls = (mode: ViewMode) => {
      const viewControls = new OrbitControls<THREE.Camera>(camerasByView[mode], renderer.domElement);
      const rotationEnabled = mode === "3D";
      viewControls.enabled = mode === initialProject.project.view;
      viewControls.enableDamping = true;
      viewControls.dampingFactor = 0.08;
      viewControls.target.set(0, mode === "2D" ? 0 : 1, 0);
      viewControls.minDistance = 4;
      viewControls.maxDistance = 16;
      viewControls.minZoom = 0.55;
      viewControls.maxZoom = 3;
      viewControls.maxPolarAngle = Math.PI * 0.49;
      viewControls.enableRotate = rotationEnabled;
      viewControls.mouseButtons.LEFT = rotationEnabled ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
      viewControls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
      viewControls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
      // Reserve one-finger gestures for selecting objects. Camera pan and pinch-zoom
      // require two fingers so an accidental swipe cannot move the canvas.
      viewControls.touches.ONE = null;
      viewControls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
      return viewControls;
    };
    const controlsByView: Record<ViewMode, OrbitControls<THREE.Camera>> = { "2D": makeViewControls("2D"), "3D": makeViewControls("3D"), ISO: makeViewControls("ISO") };
    let controls = controlsByView[initialProject.project.view];
    const resetViewCamera = (mode: ViewMode) => {
      const camera = camerasByView[mode];
      const viewControls = controlsByView[mode];
      if (mode === "2D") {
        orthographicCamera.position.set(0, 10, 0);
        orthographicCamera.zoom = 1;
        viewControls.target.set(0, 0, 0);
      } else if (mode === "ISO") {
        isometricCamera.position.set(6.4, 6.4, 6.4);
        isometricCamera.zoom = 1;
        viewControls.target.set(0, 1, 0);
      } else {
        perspectiveCamera.position.set(6.8, 5.7, 7.6);
        viewControls.target.set(0, 1, 0);
      }
      camera.updateProjectionMatrix();
    };
    const transform = new TransformControls(activeCamera, renderer.domElement);
    transform.setMode("translate");
    transform.setSize(0.72);
    scene.add(transform.getHelper());

    const selectedBounds = new THREE.Box3Helper(new THREE.Box3(), sceneThemes[initialProject.project.colorMode].ink);
    const selectedBoundsMaterial = selectedBounds.material as THREE.LineBasicMaterial;
    selectedBoundsMaterial.transparent = true;
    selectedBoundsMaterial.opacity = 0.95;
    selectedBoundsMaterial.depthTest = false;
    selectedBounds.renderOrder = 900;
    selectedBounds.visible = false;
    scene.add(selectedBounds);
    const hoverBounds = new THREE.Box3Helper(new THREE.Box3(), sceneThemes[initialProject.project.colorMode].ink);
    const hoverBoundsMaterial = hoverBounds.material as THREE.LineBasicMaterial;
    hoverBoundsMaterial.transparent = true;
    hoverBoundsMaterial.opacity = 0.42;
    hoverBoundsMaterial.depthTest = false;
    hoverBounds.renderOrder = 899;
    hoverBounds.visible = false;
    scene.add(hoverBounds);
    const interactionPreview = new THREE.Group();
    interactionPreview.renderOrder = 901;
    const movePreview = new THREE.AxesHelper(0.82);
    (movePreview.material as THREE.Material).depthTest = false;
    interactionPreview.add(movePreview);
    const rotationPoints = Array.from({ length: 49 }, (_, index) => {
      const angle = (index / 48) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * .72, 0, Math.sin(angle) * .72);
    });
    const rotatePreview = new THREE.Group();
    const rotationMaterial = new THREE.LineBasicMaterial({ color: sceneThemes[initialProject.project.colorMode].ink, depthTest: false, transparent: true, opacity: .95 });
    rotatePreview.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rotationPoints.slice(0, -1)), rotationMaterial));
    rotatePreview.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([rotationPoints[0], new THREE.Vector3(.9, 0, 0)]), rotationMaterial));
    const handle = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 8), new THREE.MeshBasicMaterial({ color: sceneThemes[initialProject.project.colorMode].ink, depthTest: false }));
    handle.position.set(.9, 0, 0);
    rotatePreview.add(handle);
    interactionPreview.add(rotatePreview);
    interactionPreview.visible = false;
    scene.add(interactionPreview);

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
    let hovered: THREE.Group | null = null;
    let serial = 1;
    let dragging = false;
    let currentToolMode: ToolMode = "select";
    let currentColorMode: ColorMode = initialProject.project.colorMode;
    let currentViewMode: ViewMode = initialProject.project.view;
    let focusModeActive = false;
    let measurementTimer: ReturnType<typeof setTimeout> | null = null;
    const HISTORY_LIMIT = 100;
    const history = new ProjectHistory<RoomaObject>(HISTORY_LIMIT);
    let dragBefore: RoomaObject | null = null;
    const allocatedIds = new Set(initialProject.objects.map(object => object.id));
    const allocateId = (kind: string) => {
      let id = `${kind}-${serial++}`;
      while (allocatedIds.has(id)) id = `${kind}-${serial++}`;
      allocatedIds.add(id);
      return id;
    };
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
      const semanticSize = group.userData.parametricSize as Point3;
      const size = new THREE.Vector3(semanticSize.x, semanticSize.y, semanticSize.z);
      const center = new THREE.Vector3(0, semanticSize.y / 2, 0);
      group.userData.localBounds = {
        min: [-semanticSize.x / 2, 0, -semanticSize.z / 2],
        max: [semanticSize.x / 2, semanticSize.y, semanticSize.z / 2],
        size: size.toArray(),
      };
      const proxy = new THREE.Mesh(geometry(`proxy:${size.x.toFixed(3)}:${size.y.toFixed(3)}:${size.z.toFixed(3)}`, () => new THREE.BoxGeometry(size.x, size.y, size.z)), materials.pick);
      proxy.position.copy(center);
      proxy.visible = false;
      proxy.userData.root = group;
      group.add(proxy);
      group.userData.pickProxy = proxy;
      pickTargets.add(proxy);
    };
    const updateBounds = (group: THREE.Group) => {
      const definition = {
        position: { x: group.position.x, y: group.position.y, z: group.position.z },
        rotationY: THREE.MathUtils.radToDeg(group.rotation.y),
        size: group.userData.parametricSize as Point3,
      };
      const semantic = boundsForSizedObject(definition);
      const bounds = boundsCache.get(group) ?? new THREE.Box3();
      bounds.min.set(semantic.min.x, semantic.min.y, semantic.min.z);
      bounds.max.set(semantic.max.x, semantic.max.y, semantic.max.z);
      boundsCache.set(group, bounds);
      return bounds;
    };
    const updateInteractionFeedback = () => {
      selectedBounds.visible = !focusModeActive && Boolean(current);
      if (current) selectedBounds.box.copy(updateBounds(current)).expandByScalar(.035);
      hoverBounds.visible = !focusModeActive && Boolean(hovered && hovered !== current);
      if (hovered && hovered !== current) hoverBounds.box.copy(updateBounds(hovered)).expandByScalar(.055);
      interactionPreview.visible = !focusModeActive && Boolean(hovered);
      movePreview.visible = currentToolMode === "translate";
      rotatePreview.visible = currentToolMode === "rotate";
      if (hovered) interactionPreview.position.copy(updateBounds(hovered).getCenter(new THREE.Vector3()));
      renderer.domElement.style.cursor = focusModeActive ? "grab" : hovered ? currentToolMode === "translate" ? "move" : currentToolMode === "rotate" ? "grab" : "pointer" : "default";
      scheduleRender(false);
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
        const arm = Math.min(.18, w * .12); const seatH = h * .42; const backD = Math.min(.16, d * .18); const backH = h - seatH;
        box(w - arm * 2, seatH * .38, d * .72, 0, seatH, d * .06, group); box(w, backH, backD, 0, seatH + backH / 2, -d / 2 + backD / 2, group); box(arm, h * .62, d, -w / 2 + arm / 2, h * .31, 0, group); box(arm, h * .62, d, w / 2 - arm / 2, h * .31, 0, group); box(w - arm * 2.3, t, d * .65, 0, t / 2, d * .03, group);
      } else if (kind === "diningTable") {
        const top = Math.min(.1, h * .13); box(w, top, d, 0, h - top / 2, 0, group); fourLegs(h - top);
      } else if (kind === "bed") {
        const head = Math.min(.16, d * .08); const frameH = Math.min(.35, h * .36); const mattressH = Math.min(.28, h * .28);
        box(w, frameH, d - head, 0, frameH / 2, head / 2, group); box(w * .96, mattressH, d - head * 1.8, 0, frameH + mattressH / 2, head * .35, group); box(w, h, head, 0, h / 2, -d / 2 + head / 2, group, "accent");
      } else if (kind === "wardrobe") {
        box(w, h, d, 0, h / 2, 0, group); const doors = Math.max(1, Math.round(w / .65)); for (let i = 1; i < doors; i++) box(t * .22, h * .94, d * .02, -w / 2 + (w / doors) * i, h / 2, d / 2, group, "accent");
      } else if (kind === "shelf") {
        const side = Math.min(.07, w * .08); const shelfThickness = t * .55; box(side, h, d, -w / 2 + side / 2, h / 2, 0, group); box(side, h, d, w / 2 - side / 2, h / 2, 0, group); const levels = Math.max(2, Math.round(h / .42)); for (let i = 0; i <= levels; i++) box(w, shelfThickness, d, 0, shelfThickness / 2 + (h - shelfThickness) * (i / levels), 0, group);
      } else if (kind === "baseCabinet" || kind === "island") {
        const top = Math.min(.08, h * .1); const plinth = Math.min(.1, h * .12); box(w * .95, h - top - plinth, d * .94, 0, plinth + (h - top - plinth) / 2, 0, group); box(w, top, d, 0, h - top / 2, 0, group, "accent"); box(w * .84, plinth, d * .8, 0, plinth / 2, 0, group); const fronts = Math.max(1, Math.round(w / .6)); for (let i = 1; i < fronts; i++) box(t * .18, h * .68, d * .02, -w / 2 + (w / fronts) * i, h * .52, d / 2, group, "accent");
      } else if (kind === "bathtub") {
        const rim = Math.min(.12, Math.min(w, d) * .13); const base = Math.min(.16, h * .28); box(w, base, d, 0, base / 2, 0, group); box(w, h - base, rim, 0, base + (h - base) / 2, -d / 2 + rim / 2, group); box(w, h - base, rim, 0, base + (h - base) / 2, d / 2 - rim / 2, group); box(rim, h - base, d - rim * 2, -w / 2 + rim / 2, base + (h - base) / 2, 0, group); box(rim, h - base, d - rim * 2, w / 2 - rim / 2, base + (h - base) / 2, 0, group);
      } else if (kind === "vanity") {
        const top = Math.min(.1, h * .12); const bodyH = h * .68; box(w * .92, bodyH, d * .88, 0, bodyH / 2 + h * .12, 0, group); box(w, top, d, 0, h - top / 2, 0, group, "accent"); cylinder(Math.min(w * .22, d * .34), top * .7, 0, h - top * .35, 0, group);
      } else if (kind === "toilet") {
        const tankD = d * .34; box(w, h, tankD, 0, h / 2, -d / 2 + tankD / 2, group); const bowlD = d - tankD * .6; box(w * .78, h * .36, bowlD, 0, h * .25, d * .11, group); box(w * .86, h * .09, bowlD * .94, 0, h * .49, d * .11, group, "accent"); box(w * .5, h * .3, d * .48, 0, h * .15, d * .06, group);
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
    const finishObject = (group: THREE.Group, kind: string, label: string, position: [number, number, number], requestedSize?: Point3, requestedId?: string) => {
      const id = requestedId ?? allocateId(kind);
      allocatedIds.add(id);
      group.userData = { id, kind, label, selectable: true };
      buildParametric(group, kind, requestedSize ?? getParametricAsset(kind)?.defaultSize ?? { x: 1, y: 1, z: 1 });
      group.traverse(child => { child.userData.root = group; }); addPickProxy(group); group.position.set(...position); selectable.add(group); layout.add(group); updateBounds(group); return group;
    };
    const makeObject = (kind: string, label: string, position: [number, number, number], requestedSize?: Point3, requestedId?: string) => finishObject(new THREE.Group(), kind, label, position, requestedSize, requestedId);

    const floor = new THREE.Mesh(geometry(`floor:${room.width}:${room.depth}`, () => new THREE.PlaneGeometry(room.width, room.depth)), materials.floor);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; layout.add(floor); addSketchEdges(floor);
    const grid = new THREE.GridHelper(room.width, Math.max(8, Math.round(room.width * 4)), BLUE, 0x8190ff); grid.scale.z = room.depth / room.width; (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = 0.18; layout.add(grid);
    const architecture = new THREE.Group();
    box(room.width, 0.08, 0.08, 0, room.height, -room.depth / 2, architecture, "accent"); box(0.08, room.height, room.depth, -room.width / 2, room.height / 2, 0, architecture, "accent"); box(room.width, room.height, 0.08, 0, room.height / 2, -room.depth / 2, architecture, "wall"); box(0.08, room.height, room.depth, -room.width / 2, room.height / 2, 0, architecture, "wall"); layout.add(architecture);
    const projectObjects = new Map<string, THREE.Group>();
    initialProject.objects.forEach(definition => {
      const object = makeObject(definition.kind, definition.label, [definition.position.x, definition.position.y, definition.position.z], definition.size, definition.id);
      object.rotation.y = THREE.MathUtils.degToRad(definition.rotationY);
      projectObjects.set(definition.id, object);
    });

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
    const definitionOf = (object: THREE.Group): RoomaObject => ({
      id: object.userData.id as string,
      kind: object.userData.kind as string,
      label: object.userData.label as string,
      position: { x: object.position.x, y: object.position.y, z: object.position.z },
      rotationY: THREE.MathUtils.radToDeg(object.rotation.y),
      size: { ...(object.userData.parametricSize as Point3) },
    });
    const syncSceneObjects = () => setSceneObjects([...selectable].map(object => ({ id: object.userData.id as string, label: object.userData.label as string })));
    const syncHistoryState = () => { setCanUndo(history.canUndo); setCanRedo(history.canRedo); };
    const getMetrics = (object: THREE.Group) => {
      const selectedBox = updateBounds(object);
      const obstacles = [...selectable].filter(candidate => candidate !== object).map(candidate => ({ id: candidate.userData.id as string, label: candidate.userData.label as string, bounds: toBounds3(boundsCache.get(candidate) ?? updateBounds(candidate)) }));
      const spatial = measureSpatialRelationships(toBounds3(selectedBox), obstacles, roomBounds);
      const semanticSize = object.userData.parametricSize as Point3 | undefined;
      const baseSize = (object.userData.localBounds as { size: [number, number, number] }).size;
      spatial.dimensions = semanticSize ?? { x: baseSize[0], y: baseSize[1], z: baseSize[2] };
      const issues = spatialIssuesForObject(room, definitionOf(object), [...selectable].map(definitionOf)).map(issue => issue.message);
      return { selectedBox, spatial, issues };
    };
    const refreshMeasurements = () => {
      measurementTimer = null;
      if (!current) { clearMeasurementLayer(); setMetrics(null); return; }
      const { selectedBox, spatial, issues } = getMetrics(current); drawMeasurements(current, selectedBox, spatial);
      const definition = getParametricAsset(current.userData.kind as string);
      setMetrics({ ...spatial, position: { x: current.position.x, y: current.position.y, z: current.position.z }, rotationY: THREE.MathUtils.radToDeg(current.rotation.y), limits: definition ? { min: definition.minSize, max: definition.maxSize } : undefined, issues }); scheduleRender(false);
    };
    const scheduleMeasurementRefresh = (immediate = false) => { if (measurementTimer) clearTimeout(measurementTimer); if (immediate) refreshMeasurements(); else measurementTimer = setTimeout(refreshMeasurements, 70); };
    let persistScene = () => {};
    const select = (object: THREE.Group | null) => {
      current = object;
      if (object) {
        if (currentToolMode === "select") transform.detach(); else transform.attach(object);
        setSelectedObject({ id: object.userData.id as string, label: object.userData.label || "未命名对象" });
        setInspectorOpen(inspectorOpenPreference.current);
        if (window.innerWidth <= 760) setCatalogueOpen(false);
      } else {
        transform.detach();
        setSelectedObject(null);
        setInspectorOpen(false);
      }
      scheduleMeasurementRefresh(true);
      updateInteractionFeedback();
      scheduleRender(false);
      persistScene();
    };
    persistScene = () => {
      const project: RoomaProject = {
        schemaVersion: 1,
        project: {
          ...initialProject.project,
          view: currentViewMode,
          colorMode: currentColorMode,
          measurementsVisible: measurementLayer.visible,
          selectedObjectId: current ? current.userData.id as string : null,
        },
        objects: [...selectable].map(definitionOf),
      };
      const result = persistRoomaProject(project);
      if (result.ok) { setSaveState("saved"); setSaveMessage("本地已保存"); }
      else { setSaveState("error"); setSaveMessage("保存失败，请勿刷新"); setProjectNotice(`浏览器无法保存工程：${result.error}`); }
    };

    const findObjectById = (id: string) => [...selectable].find(object => object.userData.id === id) ?? null;
    const removeObjectFromScene = (object: THREE.Group) => {
      if (current === object) transform.detach();
      selectable.delete(object);
      pickTargets.delete(object.userData.pickProxy as THREE.Mesh);
      boundsCache.delete(object);
      layout.remove(object);
      if (current === object) current = null;
      if (hovered === object) hovered = null;
    };
    const upsertDefinition = (definition: RoomaObject) => {
      let object = findObjectById(definition.id);
      if (!object) object = makeObject(definition.kind, definition.label, [definition.position.x, definition.position.y, definition.position.z], definition.size, definition.id);
      else {
        object.userData.label = definition.label;
        rebuildObject(object, definition.size);
        object.position.set(definition.position.x, definition.position.y, definition.position.z);
      }
      object.rotation.y = THREE.MathUtils.degToRad(definition.rotationY);
      updateBounds(object);
      return object;
    };
    const applyHistoryState = (state: RoomaObject | null, id: string) => {
      const existing = findObjectById(id);
      if (!state) {
        if (existing) removeObjectFromScene(existing);
        select(null);
      } else select(upsertDefinition(state));
      setObjectCount(selectable.size);
      syncSceneObjects();
      scheduleMeasurementRefresh(true);
      updateInteractionFeedback();
      scheduleRender(true);
      persistScene();
    };
    const recordHistory = (before: RoomaObject | null, after: RoomaObject | null) => {
      if (JSON.stringify(before) === JSON.stringify(after)) return;
      history.record({ before, after });
      syncHistoryState();
    };
    const mutateCurrent = (mutation: (object: THREE.Group) => void) => {
      if (!current) return;
      const before = definitionOf(current);
      mutation(current);
      updateBounds(current);
      recordHistory(before, definitionOf(current));
      scheduleMeasurementRefresh(true);
      scheduleRender(true);
      persistScene();
    };

    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    const touchPointers = new Set<number>();
    let touchStartPoint: { x: number; y: number } | null = null;
    let touchMoved = false;
    let touchGestureHadMultiple = false;
    const rootAt = (event: PointerEvent) => { const rect = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); raycaster.setFromCamera(pointer, activeCamera); const hit = raycaster.intersectObjects([...pickTargets], false)[0]; return (hit?.object.userData.root as THREE.Group | undefined) || null; };
    const pickAt = (event: PointerEvent) => { if (!focusModeActive) select(rootAt(event)); };
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
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") { if (touchStartPoint && Math.hypot(event.clientX - touchStartPoint.x, event.clientY - touchStartPoint.y) > 8) touchMoved = true; return; }
      if (dragging) return;
      const next = rootAt(event);
      if (next !== hovered) { hovered = next; updateInteractionFeedback(); }
    };
    const onPointerLeave = () => { if (!dragging && hovered) { hovered = null; updateInteractionFeedback(); } };
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
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    transform.addEventListener("dragging-changed", event => {
      dragging = Boolean(event.value);
      controls.enabled = !dragging;
      if (dragging && current) dragBefore = definitionOf(current);
      if (!dragging) {
        if (dragBefore && current) recordHistory(dragBefore, definitionOf(current));
        dragBefore = null;
        scheduleMeasurementRefresh(true);
        persistScene();
      }
      scheduleRender(dragging);
    });
    transform.addEventListener("objectChange", () => { if (current) updateBounds(current); updateInteractionFeedback(); scheduleMeasurementRefresh(false); scheduleRender(true); });
    Object.values(controlsByView).forEach(viewControls => viewControls.addEventListener("change", () => scheduleRender(false)));

    const onResize = () => { const width = host.clientWidth; const height = host.clientHeight; if (!width || !height) return; const aspect = width / height; perspectiveCamera.aspect = aspect; perspectiveCamera.updateProjectionMatrix(); const viewHeight = 6.8; for (const camera of [orthographicCamera, isometricCamera]) { camera.left = -(viewHeight * aspect) / 2; camera.right = (viewHeight * aspect) / 2; camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2; camera.updateProjectionMatrix(); } renderer.setSize(width, height, false); scheduleRender(false); };
    const resizeObserver = new ResizeObserver(onResize); resizeObserver.observe(host);

    const api: SceneController = {
      add: (kind, label) => {
        const object = makeObject(kind, label, [0.25 + (serial % 3) * 0.35, 0, 0.25]);
        recordHistory(null, definitionOf(object));
        select(object);
        setObjectCount(selectable.size);
        syncSceneObjects();
        scheduleRender(true);
        persistScene();
      },
      duplicate: () => {
        if (!current) return;
        const source = current;
        const object = makeObject(source.userData.kind, `${source.userData.label} 副本`, [source.position.x + 0.25, source.position.y, source.position.z + 0.25], { ...(source.userData.parametricSize as Point3) });
        object.rotation.copy(source.rotation);
        recordHistory(null, definitionOf(object));
        select(object);
        setObjectCount(selectable.size);
        syncSceneObjects();
        scheduleRender(true);
        persistScene();
      },
      remove: () => {
        if (!current) return;
        const before = definitionOf(current);
        removeObjectFromScene(current);
        recordHistory(before, null);
        select(null);
        setMetrics(null);
        clearMeasurementLayer();
        setObjectCount(selectable.size);
        syncSceneObjects();
        updateInteractionFeedback();
        scheduleRender(true);
        persistScene();
      },
      setTool: mode => {
        currentToolMode = mode;
        if (mode === "select") transform.detach();
        else {
          transform.setMode(mode);
          if (current) transform.attach(current);
        }
        updateInteractionFeedback();
      },
      setView: mode => {
        const nextCamera = camerasByView[mode];
        if (mode === currentViewMode && nextCamera === activeCamera) return;
        controls.enabled = false;
        currentViewMode = mode;
        activeCamera = nextCamera;
        controls = controlsByView[mode];
        controls.enabled = true;
        transform.camera = activeCamera;
        controls.update();
        scheduleRender(false);
        persistScene();
      },
      setColorMode: mode => { currentColorMode = mode; const theme = sceneThemes[mode]; scene.background = new THREE.Color(theme.background); if (scene.fog instanceof THREE.Fog) scene.fog.color.setHex(theme.background); materials.furniture.color.setHex(theme.surface); materials.floor.color.setHex(theme.surface); materials.accent.color.setHex(theme.ink); materials.wall.color.setHex(theme.surface); materials.plant.color.setHex(theme.tint); sketchLineMaterial.color.setHex(theme.ink); selectedBoundsMaterial.color.setHex(theme.ink); hoverBoundsMaterial.color.setHex(theme.ink); rotationMaterial.color.setHex(theme.ink); (handle.material as THREE.MeshBasicMaterial).color.setHex(theme.ink); const gridMaterial = grid.material as THREE.LineBasicMaterial | THREE.LineBasicMaterial[]; const gridList = Array.isArray(gridMaterial) ? gridMaterial : [gridMaterial]; gridList.forEach((material, index) => { material.color.setHex(index === 0 ? theme.ink : theme.grid); material.opacity = index === 0 ? 0.34 : 0.16; }); scheduleMeasurementRefresh(true); scheduleRender(true); persistScene(); },
      setMeasurementsVisible: visible => { measurementLayer.visible = visible; scheduleMeasurementRefresh(true); persistScene(); },
      setFocusMode: active => {
        focusModeActive = active;
        transform.enabled = !active;
        transform.getHelper().visible = !active && currentToolMode !== "select" && Boolean(current);
        if (active) hovered = null;
        updateInteractionFeedback();
      },
      setPosition: (axis, value) => mutateCurrent(object => { object.position[axis] = value; }),
      setRotation: value => mutateCurrent(object => { object.rotation.y = THREE.MathUtils.degToRad(value); }),
      setDimension: (axis, value) => mutateCurrent(object => { const currentSize = object.userData.parametricSize as Point3; rebuildObject(object, { ...currentSize, [axis]: value }); }),
      setClearance: (clearance, value) => mutateCurrent(object => { const latest = getMetrics(object).spatial.clearances.find(item => item.key === clearance.key); if (latest) object.position[clearance.axis] += movementForClearance(latest, value); }),
      undo: () => { const entry = history.takeUndo(); if (!entry) return; applyHistoryState(entry.before, (entry.before ?? entry.after)?.id ?? ""); syncHistoryState(); },
      redo: () => { const entry = history.takeRedo(); if (!entry) return; applyHistoryState(entry.after, (entry.after ?? entry.before)?.id ?? ""); syncHistoryState(); },
      reset: () => { resetViewCamera(currentViewMode); controls.update(); scheduleRender(false); },
      selectById: id => { const object = findObjectById(id); if (object) select(object); },
    };
    controller.current = api;
    api.setView(initialProject.project.view);
    api.setColorMode(initialProject.project.colorMode);
    api.setMeasurementsVisible(initialProject.project.measurementsVisible);
    select(projectObjects.get(initialProject.project.selectedObjectId ?? "") ?? null);
    onResize();
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("button, input, textarea, select, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      if (event.code === "Space") { event.preventDefault(); api.reset(); }
      if (key === "delete" || key === "backspace") api.remove();
      if (key === "t") { setTool("select"); api.setTool("select"); }
      if (key === "g") { setTool("translate"); api.setTool("translate"); }
      if (key === "r") { setTool("rotate"); api.setTool("rotate"); }
      if (key === "h" && !event.repeat) { const next = !measurementLayer.visible; setMeasurementsVisible(next); api.setMeasurementsVisible(next); }
      if (key === "f" && !event.repeat) setFocusMode(active => !active);
      const shortcutView: ViewMode | undefined = key === "1" ? "2D" : key === "2" ? "3D" : key === "3" ? "ISO" : undefined;
      if (shortcutView && !event.repeat) { setView(shortcutView); api.setView(shortcutView); }
      if (key === "z" && (event.metaKey || event.ctrlKey)) { if (event.shiftKey) api.redo(); else api.undo(); }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown); renderer.domElement.removeEventListener("pointerdown", onPointerDown); renderer.domElement.removeEventListener("pointermove", onPointerMove); renderer.domElement.removeEventListener("pointerup", onPointerEnd); renderer.domElement.removeEventListener("pointercancel", onPointerEnd); renderer.domElement.removeEventListener("pointerleave", onPointerLeave); resizeObserver.disconnect(); renderScheduler.dispose(); if (storageStatusFrame) cancelAnimationFrame(storageStatusFrame); if (measurementTimer) clearTimeout(measurementTimer); clearMeasurementLayer(); Object.values(controlsByView).forEach(viewControls => viewControls.dispose()); transform.dispose();
      const disposedGeometries = new Set<THREE.BufferGeometry>(); const disposedMaterials = new Set<THREE.Material>();
      scene.traverse(object => { const renderable = object as THREE.Mesh | THREE.Line | THREE.Sprite; if ("geometry" in renderable && renderable.geometry && !disposedGeometries.has(renderable.geometry)) { disposedGeometries.add(renderable.geometry); renderable.geometry.dispose(); } if ("material" in renderable && renderable.material) { const list = Array.isArray(renderable.material) ? renderable.material : [renderable.material]; list.forEach(material => { if (disposedMaterials.has(material)) return; disposedMaterials.add(material); const map = (material as THREE.MeshStandardMaterial).map; if (map) map.dispose(); material.dispose(); }); } });
      renderer.dispose(); renderer.domElement.remove(); controller.current = null;
    };
  }, []);

  useEffect(() => {
    controller.current?.setFocusMode(focusMode);
  }, [focusMode]);

  const changeTool = (next: ToolMode) => { setTool(next); controller.current?.setTool(next); };
  const changeView = (next: ViewMode) => { if (next === view) return; setView(next); controller.current?.setView(next); };
  const changeColorMode = (next: ColorMode) => { setColorMode(next); controller.current?.setColorMode(next); };
  const toggleMeasurements = () => { const next = !measurementsVisible; setMeasurementsVisible(next); controller.current?.setMeasurementsVisible(next); };
  const toggleCatalogue = () => setCatalogueOpen(value => { const next = !value; if (next && window.innerWidth <= 760) setInspectorOpen(false); return next; });
  const toggleInspector = () => setInspectorOpen(value => { const next = !value; inspectorOpenPreference.current = next; try { window.localStorage.setItem("rooma:inspector", next ? "expanded" : "collapsed"); } catch { setSaveState("error"); setSaveMessage("本地保存不可用"); setProjectNotice("属性栏偏好无法保存，工程存储也可能不可用。"); } if (next && window.innerWidth <= 760) setCatalogueOpen(false); return next; });
  const restoreBackup = () => {
    const result = restoreRoomaProjectBackupFromBrowser();
    if (result.ok) window.location.reload();
    else { setSaveState("error"); setSaveMessage("恢复失败"); setProjectNotice(result.error); }
  };
  const normalizedQuery = catalogueQuery.trim().toLowerCase();
  const visibleAssets = PARAMETRIC_ASSETS.filter(asset => asset.category === activeCategory && (!normalizedQuery || `${asset.label} ${asset.kind}`.toLowerCase().includes(normalizedQuery)));
  const hasSelection = selectedObject !== null;

  return <main className={`app-shell ${catalogueOpen ? "" : "catalogue-closed"} ${hasSelection ? inspectorOpen ? "" : "inspector-collapsed" : "inspector-hidden"} ${focusMode ? "focus-mode" : ""}`} data-color-mode={colorMode}>
    {/* THESIS: A working architectural model, not a dashboard; the room itself leads. OWN-WORLD: White drafting surface, single-color edges, sparse same-hue fills, precise compact controls. STORY: Choose an asset on the left, compose it on the canvas, then edit its properties on the right. FIRST VIEWPORT: A three-pane workbench with a left asset catalogue, central room canvas, right object inspector, and common tools in the topbar. FORM: SketchUp-style operating surface, pinned by the user's references; orthographic isometric staging. */}
    <header className="topbar"><div className="brand">ROOMA</div><div className="project-title"><span className={`status-dot ${saveState}`} /><span className="project-name">{projectName}</span><small>{saveMessage}</small></div><nav className="top-tools" aria-label="常用设计工具"><IconButton label="选择对象" shortcut="T" ariaShortcut="T" active={tool === "select"} onClick={() => changeTool("select")}><svg className="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 3 6.8 16 2.1-6 6.1-2.2L5 3Z" /></svg></IconButton><IconButton label="移动对象" shortcut="G" ariaShortcut="G" active={tool === "translate"} onClick={() => changeTool("translate")}><svg className="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" /></svg></IconButton><IconButton label="旋转对象" shortcut="R" ariaShortcut="R" active={tool === "rotate"} onClick={() => changeTool("rotate")}><svg className="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M18.8 9A8 8 0 0 0 5.4 6.2L4 8M5.2 15A8 8 0 0 0 18.6 17.8L20 16" /></svg></IconButton><span className="tool-divider" /><IconButton label="隐藏/显示空间标注" shortcut="H" ariaShortcut="H" active={measurementsVisible} onClick={toggleMeasurements}><svg className="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6v12M20 6v12M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3" /></svg></IconButton><IconButton label="纯净画布" shortcut="F" ariaShortcut="F" active={focusMode} onClick={() => setFocusMode(active => !active)}><svg className="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4" /></svg></IconButton></nav><div className="top-actions"><IconButton label="撤销" shortcut="⌘/Ctrl + Z" ariaShortcut="Meta+Z Control+Z" disabled={!canUndo} onClick={() => controller.current?.undo()}><svg className="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5M5 12h8a6 6 0 0 1 6 6" /></svg></IconButton><IconButton label="重做" shortcut="⇧⌘/Ctrl + Z" ariaShortcut="Meta+Shift+Z Control+Shift+Z" disabled={!canRedo} onClick={() => controller.current?.redo()}><svg className="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 7 5 5-5 5M19 12h-8a6 6 0 0 0-6 6" /></svg></IconButton><span className="local-mode">本地模式</span></div></header>
    {projectNotice && <div className={`project-notice ${saveState === "error" ? "error" : ""}`} role="status"><span>{projectNotice}</span>{backupAvailable && <button onClick={restoreBackup}>恢复原草稿</button>}<button aria-label="关闭提示" onClick={() => setProjectNotice(null)}>×</button></div>}
    <aside className={`catalogue ${catalogueOpen ? "open" : "closed"}`} aria-label="参数化素材"><button className="catalogue-toggle" onClick={toggleCatalogue} aria-expanded={catalogueOpen} aria-label="展开或收起标模库">{catalogueOpen ? "‹" : "›"}</button>{catalogueOpen && <div className="catalogue-content"><div className="panel-heading"><div><span>参数化标模</span><small>选择置入 · 尺寸可编辑</small></div><span className="asset-count">{PARAMETRIC_ASSETS.length}</span></div><label className="catalogue-search"><span>⌕</span><input value={catalogueQuery} onChange={event => setCatalogueQuery(event.target.value)} placeholder="搜索标模" aria-label="搜索标模" /></label><div className="category-tabs" role="tablist" aria-label="标模分类">{ASSET_CATEGORIES.map(category => <button role="tab" aria-selected={activeCategory === category.id} className={activeCategory === category.id ? "active" : ""} key={category.id} onClick={() => setActiveCategory(category.id)}>{category.label}</button>)}</div><div className="asset-list">{visibleAssets.map(item => <button className="asset-row" key={item.kind} onClick={() => controller.current?.add(item.kind, item.label)}><span className="asset-icon">{item.icon}</span><span className="asset-copy"><b>{item.label}</b><small>{formatAssetSize(item.defaultSize)}</small></span><span className="parametric-badge">参数化</span><i>＋</i></button>)}{visibleAssets.length === 0 && <div className="asset-empty">没有匹配的标模</div>}</div><div className="scene-object-section"><div><b>当前对象</b><span>{sceneObjects.length}</span></div><ul className="scene-object-list" aria-label="场景对象">{sceneObjects.map(object => <li key={object.id}><button aria-pressed={selectedObject?.id === object.id} className={selectedObject?.id === object.id ? "active" : ""} onClick={() => controller.current?.selectById(object.id)}><span>{object.label}</span><small>{object.id}</small></button></li>)}</ul></div><button className="upload-asset" disabled title="下一阶段支持 GLB / glTF">＋ 导入自定义模型</button></div>}</aside>
    <section className="workspace" aria-label="3D 室内设计画布"><div ref={canvasHost} className="canvas-host" /><button className="focus-exit" aria-label="退出纯净画布 · F" aria-keyshortcuts="F" onClick={() => setFocusMode(false)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M20 15v5h-5M4 15v5h5" /></svg><span>退出纯净画布</span><kbd>F</kbd></button><div className="display-controls" aria-label="场景显示设置"><div className="view-icons" role="group" aria-label="视图模式"><ViewButton label="2D 平面" shortcut="1" active={view === "2D"} onClick={() => changeView("2D")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-2.5 8h-14L5 8Z" /></svg></ViewButton><ViewButton label="3D 透视" shortcut="2" active={view === "3D"} onClick={() => changeView("3D")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h10v10H5V7Zm10 0 4-2v10l-4 2M15 7l4-2H9L5 7" /></svg></ViewButton><ViewButton label="等轴测" shortcut="3" active={view === "ISO"} onClick={() => changeView("ISO")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4 7 4v8l-7 4-7-4V8l7-4Zm0 8 7-4M12 12 5 8M12 12v8" /></svg></ViewButton></div><span className="display-divider" /> <div className="color-swatches" role="group" aria-label="线稿颜色">{COLOR_MODES.map(mode => <button key={mode.id} className={colorMode === mode.id ? "active" : ""} aria-label={`${mode.label}线稿`} aria-pressed={colorMode === mode.id} title={`${mode.label}线稿`} onClick={() => changeColorMode(mode.id)}><i style={{ background: mode.color }} /></button>)}</div></div><div className="room-meta"><div className="room-switcher" aria-label="当前房间">{roomInfo.name}</div><p><span>{(roomInfo.width * roomInfo.depth).toFixed(1)} m²</span><span>{roomInfo.height.toFixed(2)} m 层高</span><span>{objectCount} 个对象</span></p></div><div className="view-guidance" role="status" aria-live="polite"><b>{VIEW_INTERACTIONS[view].label}</b><span className="pointer-guidance">{VIEW_INTERACTIONS[view].pointerHint} · 空格复位</span><span className="touch-guidance">{VIEW_INTERACTIONS[view].touchHint}</span></div></section>
    {hasSelection && <section className={`inspector ${inspectorOpen ? "open" : "collapsed"}`} aria-label="选中对象属性"><button className="inspector-toggle" onClick={toggleInspector} aria-expanded={inspectorOpen} aria-label="展开或收起属性栏">{inspectorOpen ? "›" : "‹"}</button>{inspectorOpen && <div className="inspector-content"><div className="selection-title"><span>当前选择 · 参数化标模</span><b>{selectedObject?.label}</b><small>输入数值后按 Enter 或点击外部应用</small></div>{metrics ? <>
      {metrics.issues.length > 0 && <div className="spatial-warning" role="alert"><b>布局需要检查</b>{metrics.issues.map(issue => <span key={issue}>{issue}</span>)}</div>}
      <div className="inspector-section"><h3>位置与旋转</h3><div className="metric-grid position-grid">{AXES.map(axis => <div className="metric-cell" key={axis}><span>{axis.toUpperCase()}</span><MetricInput ariaLabel={`${axis.toUpperCase()} 位置`} value={metrics.position[axis]} onCommit={value => controller.current?.setPosition(axis, value)} /></div>)}<div className="metric-cell"><span>旋转 Y</span><MetricInput ariaLabel="Y 轴旋转" unit="°" step={1} value={metrics.rotationY} onCommit={value => controller.current?.setRotation(value)} /></div></div></div>
      <div className="inspector-section"><div className="section-heading"><h3>三维尺寸</h3><span>结构随尺寸自动重建</span></div><div className="metric-grid dimension-grid">{AXES.map(axis => <div className={`metric-cell axis-${axis}`} key={axis}><span>{axisLabels[axis]}</span><MetricInput ariaLabel={`${axisLabels[axis]}尺寸`} min={metrics.limits?.min[axis] ?? .01} max={metrics.limits?.max[axis]} value={metrics.dimensions[axis]} onCommit={value => controller.current?.setDimension(axis, value)} /></div>)}</div><p className="parametric-note">构件细节与常用比例保持不变，不会被拉伸变形。</p></div>
      <div className="inspector-section clearance-section"><div className="section-heading"><h3>最近空间距离</h3><span>参照墙体或物体</span></div><div className="clearance-grid">{metrics.clearances.map(clearance => <div className={`clearance-cell axis-${clearance.axis}`} key={clearance.key}><div><b>{directionLabels[clearance.key]}</b><small>{clearance.referenceLabel}</small></div><MetricInput ariaLabel={`${directionLabels[clearance.key]}到${clearance.referenceLabel}的距离`} min={0} value={clearance.distance} onCommit={value => controller.current?.setClearance(clearance, value)} /></div>)}</div></div>
      <div className="property-actions"><button onClick={() => controller.current?.remove()}>删除对象</button><button onClick={() => controller.current?.duplicate()}>复制对象</button></div>
    </> : <div className="inspector-empty">正在读取对象属性…</div>}</div>}</section>}
    <div className="sr-only" aria-live="polite">{selectedObject ? `已选择${selectedObject.label}` : "未选择对象"}；{saveMessage}</div>
  </main>;
}
