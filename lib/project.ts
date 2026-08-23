import defaultProjectData from "@/rooma.default-project.json";
import { clampParametricSize, getParametricAsset } from "@/lib/engine/parametric";
import type { Point3 } from "@/lib/engine/spatial";

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

const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const stringValue = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value.trim() : fallback;
const point = (value: unknown, fallback: Point3): Point3 => {
  const input = value && typeof value === "object" ? value as Partial<Point3> : {};
  return { x: finite(input.x, fallback.x), y: finite(input.y, fallback.y), z: finite(input.z, fallback.z) };
};

export function normalizeRoomaProject(value: unknown): RoomaProject {
  if (!value || typeof value !== "object") return structuredClone(DEFAULT_PROJECT);
  const input = value as Partial<RoomaProject>;
  const metadata = input.project && typeof input.project === "object" ? input.project : DEFAULT_PROJECT.project;
  const roomInput = metadata.room && typeof metadata.room === "object" ? metadata.room : DEFAULT_PROJECT.project.room;
  const ids = new Set<string>();
  const objects = Array.isArray(input.objects) ? input.objects.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const object = candidate as Partial<RoomaObject>;
    const asset = getParametricAsset(typeof object.kind === "string" ? object.kind : "");
    if (!asset) return [];
    let id = stringValue(object.id, `${asset.kind}-${index + 1}`);
    while (ids.has(id)) id = `${id}-${index + 1}`;
    ids.add(id);
    return [{
      id,
      kind: asset.kind,
      label: stringValue(object.label, asset.label),
      position: point(object.position, { x: 0, y: 0, z: 0 }),
      rotationY: finite(object.rotationY, 0),
      size: clampParametricSize(asset, point(object.size, asset.defaultSize)),
    }];
  }) : structuredClone(DEFAULT_PROJECT.objects);
  const view = ["3D", "ISO", "2D"].includes(metadata.view) ? metadata.view : "3D";
  const colorMode = ["blue", "red", "green", "mono"].includes(metadata.colorMode) ? metadata.colorMode : "blue";
  const selectedObjectId = typeof metadata.selectedObjectId === "string" && ids.has(metadata.selectedObjectId) ? metadata.selectedObjectId : objects[0]?.id ?? null;
  return {
    schemaVersion: 1,
    project: {
      name: stringValue(metadata.name, DEFAULT_PROJECT.project.name),
      room: {
        name: stringValue(roomInput.name, DEFAULT_PROJECT.project.room.name),
        width: Math.max(1, finite(roomInput.width, DEFAULT_PROJECT.project.room.width)),
        depth: Math.max(1, finite(roomInput.depth, DEFAULT_PROJECT.project.room.depth)),
        height: Math.max(1.8, finite(roomInput.height, DEFAULT_PROJECT.project.room.height)),
      },
      view: view as RoomaView,
      colorMode: colorMode as RoomaColorMode,
      measurementsVisible: metadata.measurementsVisible !== false,
      selectedObjectId,
    },
    objects,
  };
}

export function encodeRoomaProject(project: RoomaProject) {
  const bytes = new TextEncoder().encode(JSON.stringify(normalizeRoomaProject(project)));
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeRoomaProject(encoded: string): RoomaProject | null {
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return normalizeRoomaProject(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

export function loadRoomaProjectFromBrowser(): RoomaProject {
  const encoded = new URLSearchParams(window.location.hash.slice(1)).get("project");
  const fromHash = encoded ? decodeRoomaProject(encoded) : null;
  if (fromHash) {
    window.localStorage.setItem(ROOMA_PROJECT_STORAGE_KEY, JSON.stringify(fromHash));
    return fromHash;
  }
  try {
    const stored = window.localStorage.getItem(ROOMA_PROJECT_STORAGE_KEY);
    return stored ? normalizeRoomaProject(JSON.parse(stored)) : structuredClone(DEFAULT_PROJECT);
  } catch {
    return structuredClone(DEFAULT_PROJECT);
  }
}

export function persistRoomaProject(project: RoomaProject) {
  window.localStorage.setItem(ROOMA_PROJECT_STORAGE_KEY, JSON.stringify(normalizeRoomaProject(project)));
}
