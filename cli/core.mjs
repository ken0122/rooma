import { ASSET_CATEGORIES, PARAMETRIC_ASSETS, getAsset } from "./catalogue.mjs";
import { readFileSync } from "node:fs";
import { PROJECT_SCHEMA_VERSION, ROOM_LIMITS, boundsForSizedObject, objectOutsideRoomBounds } from "../lib/project-domain.js";

export const DEFAULT_APP_URL = "https://rooma-3d-editor.ron-nextop.workers.dev/";
export const HISTORY_LIMIT = 100;

export class CliError extends Error {
  constructor(code, message, exitCode = 2, details) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

export const DEFAULT_PROJECT = JSON.parse(readFileSync(new URL("../rooma.default-project.json", import.meta.url), "utf8"));

export const clone = value => structuredClone(value);

const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const finite = value => typeof value === "number" && Number.isFinite(value);
const nonEmpty = value => typeof value === "string" && value.trim().length > 0;

export function validateProject(project) {
  const errors = [];
  if (!isObject(project)) return { valid: false, errors: ["项目根节点必须是对象"] };
  if (project.schemaVersion !== PROJECT_SCHEMA_VERSION) errors.push(`schemaVersion 必须为 ${PROJECT_SCHEMA_VERSION}`);
  if (!isObject(project.project)) errors.push("project 必须是对象");
  const metadata = isObject(project.project) ? project.project : {};
  if (!nonEmpty(metadata.name)) errors.push("project.name 必须是非空字符串");
  if (!isObject(metadata.room)) errors.push("project.room 必须是对象");
  const room = isObject(metadata.room) ? metadata.room : {};
  if (!nonEmpty(room.name)) errors.push("project.room.name 必须是非空字符串");
  for (const field of ["width", "depth"]) {
    if (!finite(room[field]) || room[field] < ROOM_LIMITS[field].min) errors.push(`project.room.${field} 不能小于 ${ROOM_LIMITS[field].min} m`);
  }
  if (!finite(room.height) || room.height < ROOM_LIMITS.height.min) errors.push(`project.room.height 不能小于 ${ROOM_LIMITS.height.min} m`);
  if (!["3D", "ISO", "2D"].includes(metadata.view)) errors.push("project.view 必须是 3D、ISO 或 2D");
  if (!["blue", "red", "green", "mono"].includes(metadata.colorMode)) errors.push("project.colorMode 必须是 blue、red、green 或 mono");
  if (typeof metadata.measurementsVisible !== "boolean") errors.push("project.measurementsVisible 必须是布尔值");
  if (!Array.isArray(project.objects)) errors.push("objects 必须是数组");

  const ids = new Set();
  for (const [index, object] of (Array.isArray(project.objects) ? project.objects : []).entries()) {
    const path = `objects[${index}]`;
    if (!isObject(object)) { errors.push(`${path} 必须是对象`); continue; }
    if (!nonEmpty(object.id)) errors.push(`${path}.id 必须是非空字符串`);
    else if (ids.has(object.id)) errors.push(`${path}.id 与其他对象重复: ${object.id}`);
    else ids.add(object.id);
    const asset = getAsset(object.kind);
    if (!asset) errors.push(`${path}.kind 不受支持: ${String(object.kind)}`);
    if (!nonEmpty(object.label)) errors.push(`${path}.label 必须是非空字符串`);
    for (const field of ["position", "size"]) {
      if (!isObject(object[field])) { errors.push(`${path}.${field} 必须是三维坐标对象`); continue; }
      for (const axis of ["x", "y", "z"]) if (!finite(object[field][axis])) errors.push(`${path}.${field}.${axis} 必须是有限数字`);
    }
    if (!finite(object.rotationY)) errors.push(`${path}.rotationY 必须是有限数字`);
    if (asset && isObject(object.size)) {
      for (const axis of ["x", "y", "z"]) {
        const value = object.size[axis];
        if (finite(value) && (value < asset.minSize[axis] || value > asset.maxSize[axis])) {
          errors.push(`${path}.size.${axis} 必须在 ${asset.minSize[axis]}–${asset.maxSize[axis]} m 之间`);
        }
      }
    }
  }
  if (metadata.selectedObjectId !== null && typeof metadata.selectedObjectId !== "string") errors.push("project.selectedObjectId 必须是字符串或 null");
  if (typeof metadata.selectedObjectId === "string" && !ids.has(metadata.selectedObjectId)) errors.push(`选中对象不存在: ${metadata.selectedObjectId}`);
  return { valid: errors.length === 0, errors };
}

export function assertValidProject(project) {
  const result = validateProject(project);
  if (!result.valid) throw new CliError("INVALID_PROJECT", `项目文件无效：${result.errors.join("；")}`, 3, { errors: result.errors });
  return project;
}

export function resolveObject(project, reference) {
  if (!nonEmpty(reference)) throw new CliError("MISSING_OBJECT", "必须指定对象 ID 或名称", 2);
  const exactId = project.objects.find(object => object.id === reference);
  if (exactId) return exactId;
  const exactLabels = project.objects.filter(object => object.label === reference);
  if (exactLabels.length === 1) return exactLabels[0];
  if (exactLabels.length > 1) throw new CliError("AMBIGUOUS_OBJECT", `对象名称不唯一：${reference}，请改用 ID`, 5, { matches: exactLabels.map(({ id, label }) => ({ id, label })) });
  const normalized = reference.toLowerCase();
  const partial = project.objects.filter(object => object.label.toLowerCase().includes(normalized) || object.id.toLowerCase().includes(normalized));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) throw new CliError("AMBIGUOUS_OBJECT", `对象匹配不唯一：${reference}，请改用 ID`, 5, { matches: partial.map(({ id, label }) => ({ id, label })) });
  throw new CliError("OBJECT_NOT_FOUND", `找不到对象：${reference}`, 4);
}

export function nextObjectId(project, kind) {
  const ids = new Set(project.objects.map(object => object.id));
  for (let index = 1; ; index += 1) {
    const candidate = `${kind}-${index}`;
    if (!ids.has(candidate)) return candidate;
  }
}

export function parseNumber(value, label) {
  if (value === undefined) throw new CliError("MISSING_VALUE", `${label} 缺少数值`, 2);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new CliError("INVALID_NUMBER", `${label} 必须是有限数字，收到：${value}`, 3);
  return parsed;
}

export function parseBoolean(value, label = "值") {
  const normalized = String(value).toLowerCase();
  if (["on", "true", "1", "show", "visible", "yes"].includes(normalized)) return true;
  if (["off", "false", "0", "hide", "hidden", "no"].includes(normalized)) return false;
  throw new CliError("INVALID_BOOLEAN", `${label} 必须是 on 或 off`, 3);
}

export function parseVector(value, label) {
  const pieces = String(value ?? "").split(",").map(item => item.trim());
  if (pieces.length !== 3) throw new CliError("INVALID_VECTOR", `${label} 必须是 x,y,z`, 3);
  return { x: parseNumber(pieces[0], `${label}.x`), y: parseNumber(pieces[1], `${label}.y`), z: parseNumber(pieces[2], `${label}.z`) };
}

export function assertSize(asset, size) {
  for (const axis of ["x", "y", "z"]) {
    if (!finite(size[axis]) || size[axis] < asset.minSize[axis] || size[axis] > asset.maxSize[axis]) {
      throw new CliError("SIZE_OUT_OF_RANGE", `${asset.label} 的 ${axis} 尺寸必须在 ${asset.minSize[axis]}–${asset.maxSize[axis]} m 之间`, 3, { axis, min: asset.minSize[axis], max: asset.maxSize[axis], received: size[axis] });
    }
  }
}

export function encodeProject(project) {
  assertValidProject(project);
  return Buffer.from(JSON.stringify(project), "utf8").toString("base64url");
}

export function projectUrl(project, baseUrl = process.env.ROOMA_APP_URL || DEFAULT_APP_URL) {
  let url;
  try { url = new URL(baseUrl); }
  catch { throw new CliError("INVALID_URL", `无效的 Web App 地址：${baseUrl}`, 3); }
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) throw new CliError("INVALID_URL_PROTOCOL", "Web App 地址必须使用 https；本地开发仅允许 localhost 或环回地址使用 http", 3);
  url.hash = `project=${encodeProject(project)}`;
  return url.toString();
}

export function listAssets({ category, query } = {}) {
  if (category && !ASSET_CATEGORIES.some(item => item.id === category)) throw new CliError("INVALID_CATEGORY", `未知素材分类：${category}`, 3);
  const normalizedQuery = String(query ?? "").trim().toLowerCase();
  return PARAMETRIC_ASSETS.filter(asset => (!category || asset.category === category) && (!normalizedQuery || `${asset.kind} ${asset.label}`.toLowerCase().includes(normalizedQuery)));
}

export function projectSummary(project) {
  const selected = project.project.selectedObjectId ? project.objects.find(object => object.id === project.project.selectedObjectId) ?? null : null;
  return {
    name: project.project.name,
    room: { ...project.project.room, area: project.project.room.width * project.project.room.depth },
    view: project.project.view,
    colorMode: project.project.colorMode,
    measurementsVisible: project.project.measurementsVisible,
    objectCount: project.objects.length,
    selectedObject: selected ? { id: selected.id, label: selected.label } : null,
  };
}

export function objectOutsideRoom(project, object) {
  return objectOutsideRoomBounds(project.project.room, object);
}

const AXES = ["x", "y", "z"];
const DIRECTION_KEYS = {
  left: "x-negative",
  right: "x-positive",
  bottom: "y-negative",
  top: "y-positive",
  back: "z-negative",
  front: "z-positive",
};

export function boundsForObject(object) {
  return boundsForSizedObject(object);
}

function overlapsOnOtherAxes(a, b, axis) {
  return AXES.filter(candidate => candidate !== axis).every(other => a.min[other] < b.max[other] && a.max[other] > b.min[other]);
}

export function inspectObject(project, reference) {
  const object = typeof reference === "string" ? resolveObject(project, reference) : reference;
  const selected = boundsForObject(object);
  const room = project.project.room;
  const roomBounds = { min: { x: -room.width / 2, y: 0, z: -room.depth / 2 }, max: { x: room.width / 2, y: room.height, z: room.depth / 2 } };
  const roomLabels = {
    x: ["左侧墙体", "右侧墙体"],
    y: ["地面", "顶面"],
    z: ["后侧墙体", "前侧墙体"],
  };
  const clearances = [];
  for (const axis of AXES) {
    const nearest = {
      negative: { distance: Math.max(0, selected.min[axis] - roomBounds.min[axis]), referenceId: `room-${axis}-negative`, referenceLabel: roomLabels[axis][0], referenceCoordinate: roomBounds.min[axis] },
      positive: { distance: Math.max(0, roomBounds.max[axis] - selected.max[axis]), referenceId: `room-${axis}-positive`, referenceLabel: roomLabels[axis][1], referenceCoordinate: roomBounds.max[axis] },
    };
    for (const candidate of project.objects) {
      if (candidate.id === object.id) continue;
      const obstacle = boundsForObject(candidate);
      if (!overlapsOnOtherAxes(selected, obstacle, axis)) continue;
      if (obstacle.max[axis] <= selected.min[axis]) {
        const distance = selected.min[axis] - obstacle.max[axis];
        if (distance < nearest.negative.distance) nearest.negative = { distance, referenceId: candidate.id, referenceLabel: candidate.label, referenceCoordinate: obstacle.max[axis] };
      }
      if (obstacle.min[axis] >= selected.max[axis]) {
        const distance = obstacle.min[axis] - selected.max[axis];
        if (distance < nearest.positive.distance) nearest.positive = { distance, referenceId: candidate.id, referenceLabel: candidate.label, referenceCoordinate: obstacle.min[axis] };
      }
    }
    for (const direction of ["negative", "positive"]) clearances.push({ key: `${axis}-${direction}`, axis, direction, ...nearest[direction] });
  }
  return {
    object,
    position: clone(object.position),
    rotationY: object.rotationY,
    dimensions: clone(object.size),
    bounds: selected,
    clearances,
  };
}

export function directionKey(direction) {
  const key = DIRECTION_KEYS[String(direction).toLowerCase()];
  if (!key) throw new CliError("INVALID_DIRECTION", "方向必须是 left、right、bottom、top、back 或 front", 3);
  return key;
}

export function movementForTargetClearance(clearance, targetDistance) {
  if (!Number.isFinite(targetDistance) || targetDistance < 0) throw new CliError("INVALID_CLEARANCE", "目标净距必须是大于或等于 0 的有限数字", 3);
  return clearance.direction === "negative" ? targetDistance - clearance.distance : clearance.distance - targetDistance;
}
