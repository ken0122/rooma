"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

type ToolMode = "translate" | "rotate" | "scale";
type ViewMode = "3D" | "2D";
type SceneController = {
  add: (kind: string, label: string) => void;
  remove: () => void;
  setTool: (mode: ToolMode) => void;
  setView: (mode: ViewMode) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
};

const BLUE = 0x2436d8;
const SOFT_BLUE = 0x8190ff;
const WHITE = 0xffffff;

const catalogue = [
  { kind: "bathtub", label: "独立浴缸", icon: "▱" },
  { kind: "vanity", label: "洗漱台", icon: "◉" },
  { kind: "toilet", label: "智能马桶", icon: "◒" },
  { kind: "cabinet", label: "收纳柜", icon: "▥" },
  { kind: "stool", label: "浴室凳", icon: "◇" },
  { kind: "plant", label: "绿植", icon: "♧" },
];

function IconButton({ label, active, children, onClick }: { label: string; active?: boolean; children: React.ReactNode; onClick?: () => void }) {
  return <button className={`icon-button ${active ? "active" : ""}`} aria-label={label} title={label} onClick={onClick}>{children}</button>;
}

export default function Home() {
  const canvasHost = useRef<HTMLDivElement>(null);
  const controller = useRef<SceneController | null>(null);
  const [tool, setTool] = useState<ToolMode>("translate");
  const [view, setView] = useState<ViewMode>("3D");
  const [selected, setSelected] = useState("智能马桶");
  const [objectCount, setObjectCount] = useState(6);
  const [catalogueOpen, setCatalogueOpen] = useState(true);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    const host = canvasHost.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf6f7fb);
    scene.fog = new THREE.Fog(0xf6f7fb, 16, 30);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(6.8, 5.7, 7.6);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "scene-canvas";
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 1, 0);
    controls.minDistance = 4;
    controls.maxDistance = 16;
    controls.maxPolarAngle = Math.PI * 0.49;

    const transform = new TransformControls(camera, renderer.domElement);
    transform.setMode("translate");
    transform.setSize(0.72);
    const transformHelper = transform.getHelper();
    scene.add(transformHelper);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xd9ddff, 2.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(4, 8, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);

    const layout = new THREE.Group();
    layout.name = "layout";
    scene.add(layout);
    const selectable = new Set<THREE.Object3D>();
    let current: THREE.Object3D | null = null;
    let renderPending = false;
    let serial = 10;
    let dragging = false;
    const undoStack: Array<{ object: THREE.Object3D; position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 }> = [];
    const redoStack: typeof undoStack = [];

    const invalidate = () => {
      if (renderPending) return;
      renderPending = true;
      requestAnimationFrame(() => {
        controls.update();
        renderer.render(scene, camera);
        renderPending = false;
      });
    };

    const material = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.72, metalness: 0, transparent: true, opacity: 0.97 });
    const accentMaterial = new THREE.MeshStandardMaterial({ color: 0x2f43ec, roughness: 0.65 });
    const lineMaterial = new THREE.LineBasicMaterial({ color: BLUE, transparent: true, opacity: 0.88 });

    const edgesFor = (mesh: THREE.Mesh, opacity = 0.82) => {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), lineMaterial.clone());
      (edges.material as THREE.LineBasicMaterial).opacity = opacity;
      mesh.add(edges);
    };

    const box = (w: number, h: number, d: number, x: number, y: number, z: number, parent: THREE.Group, accent = false) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), accent ? accentMaterial : material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      edgesFor(mesh);
      parent.add(mesh);
      return mesh;
    };

    const cylinder = (r: number, h: number, x: number, y: number, z: number, parent: THREE.Group, accent = false) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28), accent ? accentMaterial : material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      edgesFor(mesh, 0.62);
      parent.add(mesh);
      return mesh;
    };

    const finishObject = (group: THREE.Group, kind: string, label: string, position: [number, number, number]) => {
      group.position.set(...position);
      group.userData = { id: `${kind}-${serial++}`, kind, label, selectable: true };
      group.traverse(child => { child.userData.root = group; });
      selectable.add(group);
      layout.add(group);
      return group;
    };

    const makeObject = (kind: string, label: string, position: [number, number, number]) => {
      const group = new THREE.Group();
      if (kind === "bathtub") {
        box(2.45, 0.18, 1.18, 0, 0.12, 0, group);
        box(2.45, 0.7, 0.13, 0, 0.48, -0.53, group);
        box(2.45, 0.7, 0.13, 0, 0.48, 0.53, group);
        box(0.13, 0.7, 0.94, -1.16, 0.48, 0, group);
        box(0.13, 0.7, 0.94, 1.16, 0.48, 0, group);
      } else if (kind === "vanity") {
        box(1.5, 0.78, 0.58, 0, 0.4, 0, group);
        box(1.68, 0.12, 0.68, 0, 0.84, 0, group);
        cylinder(0.29, 0.16, 0, 0.98, 0, group);
        box(0.03, 0.58, 0.03, 0.78, 0.39, 0.31, group);
        box(0.03, 0.58, 0.03, 0.78, 0.39, -0.31, group);
      } else if (kind === "toilet") {
        box(0.66, 0.58, 0.36, 0, 0.42, -0.24, group);
        const bowl = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.42, 8, 20), material);
        bowl.rotation.x = Math.PI / 2;
        bowl.scale.set(1, 0.55, 1);
        bowl.position.set(0, 0.35, 0.22);
        bowl.castShadow = true;
        edgesFor(bowl, 0.6);
        group.add(bowl);
      } else if (kind === "cabinet") {
        box(0.82, 1.7, 0.48, 0, 0.86, 0, group);
        for (let y = 0.3; y < 1.5; y += 0.42) box(0.75, 0.025, 0.5, 0, y, 0, group);
      } else if (kind === "stool") {
        cylinder(0.37, 0.1, 0, 0.5, 0, group);
        for (const x of [-0.24, 0.24]) for (const z of [-0.18, 0.18]) box(0.07, 0.48, 0.07, x, 0.25, z, group);
      } else if (kind === "plant") {
        cylinder(0.28, 0.42, 0, 0.22, 0, group, true);
        for (let i = 0; i < 8; i++) {
          const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshStandardMaterial({ color: 0x5062e9, roughness: 0.8 }));
          leaf.scale.set(0.55, 1.7, 0.35);
          leaf.position.set(Math.cos(i) * 0.2, 0.58 + (i % 3) * 0.1, Math.sin(i) * 0.2);
          leaf.rotation.z = (i - 4) * 0.12;
          group.add(leaf);
        }
      }
      return finishObject(group, kind, label, position);
    };

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 5.1), new THREE.MeshStandardMaterial({ color: 0xfdfdff, roughness: 0.96 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    layout.add(floor);
    const grid = new THREE.GridHelper(6, 24, BLUE, SOFT_BLUE);
    grid.scale.z = 0.85;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.22;
    layout.add(grid);
    const architecture = new THREE.Group();
    box(6, 0.08, 0.08, 0, 3.05, -2.55, architecture, true);
    box(0.08, 3.05, 5.1, -3, 1.53, 0, architecture, true);
    box(6, 3.05, 0.08, 0, 1.53, -2.55, architecture);
    box(0.08, 3.05, 5.1, -3, 1.53, 0, architecture);
    architecture.children.forEach((child, i) => { if (i > 1 && child instanceof THREE.Mesh) (child.material as THREE.MeshStandardMaterial).opacity = 0.2; });
    layout.add(architecture);

    makeObject("bathtub", "嵌入式浴缸", [-0.75, 0, -1.55]);
    makeObject("vanity", "悬浮洗漱台", [1.9, 0, -1.65]);
    const toilet = makeObject("toilet", "智能马桶", [1.35, 0, 1.35]);
    makeObject("cabinet", "毛巾柜", [-2.5, 0, 1.5]);
    makeObject("stool", "浴室凳", [-1.35, 0, 1.25]);
    makeObject("plant", "绿植", [2.35, 0, 0.65]);

    const select = (object: THREE.Object3D | null) => {
      current = object;
      if (object) {
        transform.attach(object);
        setSelected(object.userData.label || "未命名对象");
      } else {
        transform.detach();
        setSelected("未选择对象");
      }
      invalidate();
    };

    const snapshot = (object: THREE.Object3D) => ({ object, position: object.position.clone(), rotation: object.rotation.clone(), scale: object.scale.clone() });
    const restore = (state: ReturnType<typeof snapshot>) => {
      state.object.position.copy(state.position);
      state.object.rotation.copy(state.rotation);
      state.object.scale.copy(state.scale);
      select(state.object);
      invalidate();
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onPointerDown = (event: PointerEvent) => {
      if (dragging) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects([...selectable], true)[0];
      const root = hit?.object.userData.root as THREE.Object3D | undefined;
      select(root || null);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    transform.addEventListener("dragging-changed", (event) => {
      dragging = Boolean(event.value);
      controls.enabled = !dragging;
      if (dragging && current) undoStack.push(snapshot(current));
      if (!dragging) redoStack.length = 0;
      invalidate();
    });
    transform.addEventListener("objectChange", invalidate);
    controls.addEventListener("change", invalidate);

    const onResize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      invalidate();
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(host);

    const api: SceneController = {
      add: (kind, label) => {
        const object = makeObject(kind, label, [0.25 + (serial % 3) * 0.35, 0, 0.25]);
        select(object);
        setObjectCount(selectable.size);
        setSaved(false);
      },
      remove: () => {
        if (!current) return;
        transform.detach();
        selectable.delete(current);
        layout.remove(current);
        current = null;
        setSelected("未选择对象");
        setObjectCount(selectable.size);
        setSaved(false);
        invalidate();
      },
      setTool: mode => { transform.setMode(mode); invalidate(); },
      setView: mode => {
        if (mode === "2D") {
          camera.position.set(0, 9.5, 0.01);
          controls.target.set(0, 0, 0);
          controls.enableRotate = false;
        } else {
          camera.position.set(6.8, 5.7, 7.6);
          controls.target.set(0, 1, 0);
          controls.enableRotate = true;
        }
        controls.update();
        invalidate();
      },
      undo: () => {
        const state = undoStack.pop();
        if (!state) return;
        redoStack.push(snapshot(state.object));
        restore(state);
      },
      redo: () => {
        const state = redoStack.pop();
        if (!state) return;
        undoStack.push(snapshot(state.object));
        restore(state);
      },
      reset: () => {
        camera.position.set(6.8, 5.7, 7.6);
        controls.target.set(0, 1, 0);
        controls.update();
        invalidate();
      },
    };
    controller.current = api;
    select(toilet);
    onResize();

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "delete" || key === "backspace") api.remove();
      if (key === "g") { setTool("translate"); api.setTool("translate"); }
      if (key === "r") { setTool("rotate"); api.setTool("rotate"); }
      if (key === "s" && !event.metaKey) { setTool("scale"); api.setTool("scale"); }
      if (key === "z" && (event.metaKey || event.ctrlKey)) event.shiftKey ? api.redo() : api.undo();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      resizeObserver.disconnect();
      controls.dispose();
      transform.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const mats = Array.isArray(object.material) ? object.material : [object.material];
          mats.forEach(mat => mat.dispose());
        }
      });
      controller.current = null;
    };
  }, []);

  const changeTool = (next: ToolMode) => {
    setTool(next);
    controller.current?.setTool(next);
  };
  const changeView = (next: ViewMode) => {
    setView(next);
    controller.current?.setView(next);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">R</span><span>ROOMA</span></div>
        <div className="project-title"><span className="status-dot" />主卫改造方案 <button aria-label="重命名项目">⌄</button></div>
        <div className="top-actions">
          <span className={`save-state ${saved ? "saved" : ""}`}>{saved ? "已自动保存" : "有未保存更改"}</span>
          <IconButton label="撤销" onClick={() => controller.current?.undo()}>↶</IconButton>
          <IconButton label="重做" onClick={() => controller.current?.redo()}>↷</IconButton>
          <button className="share-button" onClick={() => setSaved(true)}>保存方案</button>
          <button className="avatar" aria-label="账户">LK</button>
        </div>
      </header>

      <aside className="toolrail" aria-label="设计工具">
        <IconButton label="选择" active>↖</IconButton>
        <span className="rail-divider" />
        <IconButton label="移动 G" active={tool === "translate"} onClick={() => changeTool("translate")}>✣</IconButton>
        <IconButton label="旋转 R" active={tool === "rotate"} onClick={() => changeTool("rotate")}>⟳</IconButton>
        <IconButton label="缩放 S" active={tool === "scale"} onClick={() => changeTool("scale")}>↗</IconButton>
        <span className="rail-divider" />
        <IconButton label="墙体">▰</IconButton>
        <IconButton label="门窗">▯</IconButton>
        <IconButton label="测量">⌁</IconButton>
        <div className="rail-spacer" />
        <IconButton label="快捷键">?</IconButton>
      </aside>

      <section className="workspace" aria-label="3D 室内设计画布">
        <div ref={canvasHost} className="canvas-host" />
        <div className="view-switch" role="group" aria-label="视图模式">
          <button className={view === "2D" ? "active" : ""} onClick={() => changeView("2D")}>2D 平面</button>
          <button className={view === "3D" ? "active" : ""} onClick={() => changeView("3D")}>3D 空间</button>
        </div>
        <button className="reset-view" onClick={() => controller.current?.reset()} aria-label="重置视角">⌂</button>
        <div className="room-meta"><span>主卫</span><b>18.6 m²</b><small>{objectCount} 个对象 · 3.2 m 层高</small></div>
        <div className="performance-pill"><span /> 实时渲染 · 60 FPS</div>
      </section>

      <aside className={`catalogue ${catalogueOpen ? "open" : "closed"}`}>
        <button className="catalogue-toggle" onClick={() => setCatalogueOpen(value => !value)} aria-label="展开或收起素材库">{catalogueOpen ? "›" : "‹"}</button>
        <div className="panel-heading"><div><span>素材库</span><small>拖入或点击添加</small></div><button aria-label="搜索素材">⌕</button></div>
        <div className="category-tabs"><button className="active">卫浴</button><button>家具</button><button>装饰</button></div>
        <div className="asset-grid">
          {catalogue.map(item => <button className="asset-card" key={item.kind} onClick={() => controller.current?.add(item.kind, item.label)}><span>{item.icon}</span><b>{item.label}</b><small>点击添加</small></button>)}
        </div>
        <button className="upload-asset">＋ 导入自定义模型</button>
      </aside>

      <section className="inspector" aria-label="对象属性">
        <div className="selection-title"><span>当前选择</span><b>{selected}</b></div>
        <div className="property-row"><span>位置</span><div><label>X <input defaultValue="1.35" /></label><label>Z <input defaultValue="1.35" /></label></div></div>
        <div className="property-row"><span>旋转</span><div><label>Y <input defaultValue="0°" /></label><button className="lock-button" aria-label="锁定比例">⌁</button></div></div>
        <div className="property-actions"><button onClick={() => controller.current?.remove()}>删除对象</button><button>复制</button></div>
      </section>
    </main>
  );
}
