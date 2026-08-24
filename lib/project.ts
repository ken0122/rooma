import defaultProjectData from "../rooma.default-project.json" with { type: "json" };
import { clampParametricSize, getParametricAsset } from "./engine/parametric.ts";
import type { Point3 } from "./engine/spatial.ts";
import { PROJECT_SCHEMA_VERSION, ROOM_LIMITS } from "./project-domain.js";

export type RoomaView = "3D" | "ISO" | "2D";
export type RoomaColorMode = "blue" | "red" | "green" | "mono";

export type RoomaObject = {
  id: string;
  kind: string;
  label: string;
  position: Point3;
  rotationY: number;
  size: Point3;
};

export type RoomaProject = {
  schemaVersion: 1;
  project: {
    name: string;
    room: { name: string; width: number; depth: number; height: number };
    view: RoomaView;
    colorMode: RoomaColorMode;
    measurementsVisible: boolean;
    selectedObjectId: string | null;
  };
  objects: RoomaObject[];
};

export const DEFAULT_PROJECT = structuredClone(defaultProjectData) as RoomaProject;
export const ROOMA_PROJECT_STORAGE_KEY = "rooma.project.v1";
export const ROOMA_PROJECT_BACKUP_KEY = "rooma.project.v1.backup";

export type ProjectRepair = {
  code: string;
  message: string;
};

export type RoomaProjectNormalization = {
  project: RoomaProject;
  repairs: ProjectRepair[];
  supported: boolean;
};

export type RoomaProjectLoadResult = RoomaProjectNormalization & {
  source: "hash" | "localStorage" | "default";
  notice: string | null;
  backupAvailable: boolean;
  storageError: string | null;
};

export type ProjectPersistenceResult =
  | { ok: true }
  | { ok: false; error: string };

const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const stringValue = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value.trim() : fallback;
const point = (value: unknown, fallback: Point3): Point3 => {
  const input = value && typeof value === "object" ? value as Partial<Point3> : {};
  return { x: finite(input.x, fallback.x), y: finite(input.y, fallback.y), z: finite(input.z, fallback.z) };
};

export function normalizeRoomaProjectWithReport(value: unknown): RoomaProjectNormalization {
  const repairs: ProjectRepair[] = [];
  if (!value || typeof value !== "object") {
    return { project: structuredClone(DEFAULT_PROJECT), repairs: [{ code: "INVALID_ROOT", message: "工程根节点无效，已打开默认工程。" }], supported: false };
  }
  const input = value as Partial<RoomaProject>;
  if (input.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    return { project: structuredClone(DEFAULT_PROJECT), repairs: [{ code: "UNSUPPORTED_SCHEMA", message: `不支持 schemaVersion ${String(input.schemaVersion)}，未导入该工程。` }], supported: false };
  }
  const metadata = input.project && typeof input.project === "object" ? input.project : DEFAULT_PROJECT.project;
  const roomInput = metadata.room && typeof metadata.room === "object" ? metadata.room : DEFAULT_PROJECT.project.room;
  const ids = new Set<string>();
  const objects = Array.isArray(input.objects) ? input.objects.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") {
      repairs.push({ code: "DROPPED_OBJECT", message: `第 ${index + 1} 个对象格式无效，已跳过。` });
      return [];
    }
    const object = candidate as Partial<RoomaObject>;
    const asset = getParametricAsset(typeof object.kind === "string" ? object.kind : "");
    if (!asset) {
      repairs.push({ code: "UNSUPPORTED_ASSET", message: `第 ${index + 1} 个对象使用了不支持的素材，已跳过。` });
      return [];
    }
    let id = stringValue(object.id, `${asset.kind}-${index + 1}`);
    const requestedId = id;
    while (ids.has(id)) id = `${id}-${index + 1}`;
    if (id !== requestedId) repairs.push({ code: "DUPLICATE_ID", message: `重复对象 ID ${requestedId} 已调整为 ${id}。` });
    ids.add(id);
    const requestedSize = point(object.size, asset.defaultSize);
    const size = clampParametricSize(asset, requestedSize);
    if (size.x !== requestedSize.x || size.y !== requestedSize.y || size.z !== requestedSize.z) {
      repairs.push({ code: "CLAMPED_SIZE", message: `${stringValue(object.label, asset.label)} 的尺寸已调整到素材允许范围。` });
    }
    return [{
      id,
      kind: asset.kind,
      label: stringValue(object.label, asset.label),
      position: point(object.position, { x: 0, y: 0, z: 0 }),
      rotationY: finite(object.rotationY, 0),
      size,
    }];
  }) : structuredClone(DEFAULT_PROJECT.objects);
  const view = ["3D", "ISO", "2D"].includes(metadata.view) ? metadata.view : "3D";
  const colorMode = ["blue", "red", "green", "mono"].includes(metadata.colorMode) ? metadata.colorMode : "blue";
  const selectedObjectId = typeof metadata.selectedObjectId === "string" && ids.has(metadata.selectedObjectId) ? metadata.selectedObjectId : null;
  const requestedRoom = {
    width: finite(roomInput.width, DEFAULT_PROJECT.project.room.width),
    depth: finite(roomInput.depth, DEFAULT_PROJECT.project.room.depth),
    height: finite(roomInput.height, DEFAULT_PROJECT.project.room.height),
  };
  const normalizedRoom = {
    width: Math.max(ROOM_LIMITS.width.min, requestedRoom.width),
    depth: Math.max(ROOM_LIMITS.depth.min, requestedRoom.depth),
    height: Math.max(ROOM_LIMITS.height.min, requestedRoom.height),
  };
  if (normalizedRoom.width !== requestedRoom.width || normalizedRoom.depth !== requestedRoom.depth || normalizedRoom.height !== requestedRoom.height) {
    repairs.push({ code: "CLAMPED_ROOM", message: "房间尺寸已调整到工程允许范围。" });
  }
  const project: RoomaProject = {
    schemaVersion: 1,
    project: {
      name: stringValue(metadata.name, DEFAULT_PROJECT.project.name),
      room: {
        name: stringValue(roomInput.name, DEFAULT_PROJECT.project.room.name),
        width: normalizedRoom.width,
        depth: normalizedRoom.depth,
        height: normalizedRoom.height,
      },
      view: view as RoomaView,
      colorMode: colorMode as RoomaColorMode,
      measurementsVisible: metadata.measurementsVisible === true,
      selectedObjectId,
    },
    objects,
  };
  return { project, repairs, supported: true };
}

export function normalizeRoomaProject(value: unknown): RoomaProject {
  return normalizeRoomaProjectWithReport(value).project;
}

export function encodeRoomaProject(project: RoomaProject) {
  const bytes = new TextEncoder().encode(JSON.stringify(normalizeRoomaProject(project)));
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeRoomaProject(encoded: string): RoomaProject | null {
  return decodeRoomaProjectWithReport(encoded)?.project ?? null;
}

export function decodeRoomaProjectWithReport(encoded: string): RoomaProjectNormalization | null {
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const normalized = normalizeRoomaProjectWithReport(JSON.parse(new TextDecoder().decode(bytes)));
    return normalized.supported ? normalized : null;
  } catch {
    return null;
  }
}

const storageErrorMessage = (error: unknown) => error instanceof Error ? error.message : "浏览器存储不可用";

function clearProjectHash() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  params.delete("project");
  const hash = params.toString();
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${hash ? `#${hash}` : ""}`);
}

function readStoredProject(key: string) {
  const stored = window.localStorage.getItem(key);
  if (!stored) return null;
  return normalizeRoomaProjectWithReport(JSON.parse(stored));
}

export function loadRoomaProjectFromBrowser(): RoomaProjectLoadResult {
  const encoded = new URLSearchParams(window.location.hash.slice(1)).get("project");
  const fromHash = encoded ? decodeRoomaProjectWithReport(encoded) : null;
  if (fromHash) {
    try {
      const current = readStoredProject(ROOMA_PROJECT_STORAGE_KEY);
      let backupAvailable = Boolean(window.localStorage.getItem(ROOMA_PROJECT_BACKUP_KEY));
      if (current?.supported && JSON.stringify(current.project) !== JSON.stringify(fromHash.project)) {
        window.localStorage.setItem(ROOMA_PROJECT_BACKUP_KEY, JSON.stringify(current.project));
        backupAvailable = true;
      }
      window.localStorage.setItem(ROOMA_PROJECT_STORAGE_KEY, JSON.stringify(fromHash.project));
      clearProjectHash();
      return {
        ...fromHash,
        source: "hash",
        notice: backupAvailable ? "已将分享快照作为本地副本打开，原草稿可随时恢复。" : "已将分享快照作为本地副本打开。",
        backupAvailable,
        storageError: null,
      };
    } catch (error) {
      return { ...fromHash, source: "hash", notice: "分享快照已打开，但浏览器无法保存；请勿刷新。", backupAvailable: false, storageError: storageErrorMessage(error) };
    }
  }
  if (encoded) clearProjectHash();
  try {
    const stored = readStoredProject(ROOMA_PROJECT_STORAGE_KEY);
    if (stored) {
      return {
        ...stored,
        source: "localStorage",
        notice: stored.repairs.length ? `本地工程已修复 ${stored.repairs.length} 项数据。` : encoded ? "分享链接无效，已保留本地工程。" : null,
        backupAvailable: Boolean(window.localStorage.getItem(ROOMA_PROJECT_BACKUP_KEY)),
        storageError: null,
      };
    }
    return {
      project: structuredClone(DEFAULT_PROJECT),
      repairs: [],
      supported: true,
      source: "default",
      notice: encoded ? "分享链接无效，已打开默认工程。" : null,
      backupAvailable: Boolean(window.localStorage.getItem(ROOMA_PROJECT_BACKUP_KEY)),
      storageError: null,
    };
  } catch (error) {
    return { project: structuredClone(DEFAULT_PROJECT), repairs: [], supported: true, source: "default", notice: "本地工程无法读取，已打开默认工程。", backupAvailable: false, storageError: storageErrorMessage(error) };
  }
}

export function persistRoomaProject(project: RoomaProject): ProjectPersistenceResult {
  try {
    window.localStorage.setItem(ROOMA_PROJECT_STORAGE_KEY, JSON.stringify(normalizeRoomaProject(project)));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: storageErrorMessage(error) };
  }
}

export function restoreRoomaProjectBackupFromBrowser(): ProjectPersistenceResult {
  try {
    const backup = readStoredProject(ROOMA_PROJECT_BACKUP_KEY);
    if (!backup?.supported) return { ok: false, error: "没有可恢复的本地草稿" };
    window.localStorage.setItem(ROOMA_PROJECT_STORAGE_KEY, JSON.stringify(backup.project));
    window.localStorage.removeItem(ROOMA_PROJECT_BACKUP_KEY);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: storageErrorMessage(error) };
  }
}
