#!/usr/bin/env node

import { join, resolve } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  CliError,
  DEFAULT_PROJECT,
  assertSize,
  clone,
  directionKey,
  inspectObject,
  listAssets,
  nextObjectId,
  objectOutsideRoom,
  parseBoolean,
  parseNumber,
  parseVector,
  projectSummary,
  projectUrl,
  resolveObject,
  validateProject,
  movementForTargetClearance,
} from "./core.mjs";
import { getAsset } from "./catalogue.mjs";
import { absoluteProjectPath, clearHistory, commitMutation, readProject, readProjectForValidation, redoMutation, undoMutation, withProjectLock } from "./storage.mjs";
import { ROOM_LIMITS } from "../lib/project-domain.js";

const HELP = `ROOMA CLI — 用命令操作 3D 室内布局项目

用法：rooma [--file <project.json>] [--json] <命令>

读取命令：
  status
  assets [--category <分类>] [--query <关键词>]
  object list
  object inspect <ID|名称>
  validate
  url [--base <Web App URL>]

编辑命令：
  object add <kind> [--label 名称] [--id ID] [--position x,y,z] [--size x,y,z]
  object update <ID|名称> [--label 名称] [--position x,y,z] [--x N --y N --z N]
                [--rotation N] [--size x,y,z] [--width N --height N --depth N]
  object remove <ID|名称>
  object duplicate <ID|名称> [--label 名称] [--id ID] [--offset x,y,z]
  object clearance <ID|名称> <left|right|bottom|top|back|front> <米>
  project rename <名称>
  room set [--name 名称] [--width N --depth N --height N]
  view set <3D|ISO|2D>
  theme set <blue|red|green|mono>
  measurements <on|off|toggle>
  select <ID|名称|none>
  batch --commands '<JSON 命令数组>'
  undo | redo | reset

所有长度使用米，旋转使用角度。写操作成功后会返回可直接打开的 Web App hash 链接。`;

function extractGlobals(argv) {
  const rest = [];
  let file = "rooma.project.json";
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json" || token === "-j") { json = true; continue; }
    if (token === "--file" || token === "-f") {
      if (!argv[index + 1]) throw new CliError("MISSING_VALUE", "--file 缺少路径", 2);
      file = argv[++index];
      continue;
    }
    if (token.startsWith("--file=")) { file = token.slice(7); continue; }
    rest.push(token);
  }
  return { args: rest, file: absoluteProjectPath(file), json };
}

function parseOptions(tokens) {
  const positional = [];
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) { positional.push(token); continue; }
    const equals = token.indexOf("=");
    if (equals > 2) { options[token.slice(2, equals)] = token.slice(equals + 1); continue; }
    const key = token.slice(2);
    const next = tokens[index + 1];
    if (next === undefined || next.startsWith("--")) options[key] = true;
    else { options[key] = next; index += 1; }
  }
  return { positional, options };
}

function optionValue(options, key, label = `--${key}`) {
  const value = options[key];
  if (value === true) throw new CliError("MISSING_VALUE", `${label} 缺少值`, 2);
  return value;
}

function requirePositional(positional, index, label) {
  const value = positional[index];
  if (!value) throw new CliError("MISSING_ARGUMENT", `缺少${label}`, 2);
  return value;
}

function ensureOnlyOptions(options, allowed) {
  const unexpected = Object.keys(options).filter(key => !allowed.includes(key));
  if (unexpected.length) throw new CliError("UNKNOWN_OPTION", `未知选项：${unexpected.map(key => `--${key}`).join("、")}`, 2);
}

function ensureNoExtraPositional(positional, count) {
  if (positional.length > count) throw new CliError("TOO_MANY_ARGUMENTS", `多余参数：${positional.slice(count).join(" ")}`, 2);
}

function sizeFromOptions(asset, options, current = asset.defaultSize) {
  let size = clone(current);
  if (options.size !== undefined) size = parseVector(optionValue(options, "size"), "--size");
  if (options.width !== undefined) size.x = parseNumber(optionValue(options, "width"), "--width");
  if (options.height !== undefined) size.y = parseNumber(optionValue(options, "height"), "--height");
  if (options.depth !== undefined) size.z = parseNumber(optionValue(options, "depth"), "--depth");
  assertSize(asset, size);
  return size;
}

function positionFromOptions(options, current = { x: 0, y: 0, z: 0 }) {
  let position = clone(current);
  if (options.position !== undefined) position = parseVector(optionValue(options, "position"), "--position");
  for (const axis of ["x", "y", "z"]) if (options[axis] !== undefined) position[axis] = parseNumber(optionValue(options, axis), `--${axis}`);
  return position;
}

function mutationResult(project, result, base) {
  return { changed: true, project, result, openUrl: projectUrl(project, base) };
}

async function mutate(file, description, updater, base) {
  const { project } = await readProject(file);
  const next = clone(project);
  const result = updater(next);
  await commitMutation(file, project, next, description);
  return mutationResult(next, result, base);
}

async function execute(file, args) {
  if (!args.length || args[0] === "help" || args[0] === "--help" || args[0] === "-h") return { command: "help", changed: false, result: { help: HELP } };
  const [group, action, ...tail] = args;

  if (group === "batch") {
    const { positional, options } = parseOptions([action, ...tail].filter(value => value !== undefined));
    ensureNoExtraPositional(positional, 0);
    ensureOnlyOptions(options, ["commands"]);
    let commands;
    try { commands = JSON.parse(optionValue(options, "commands")); }
    catch { throw new CliError("INVALID_BATCH", "--commands 必须是有效 JSON", 3); }
    if (!Array.isArray(commands) || !commands.length || commands.some(command => !Array.isArray(command) || !command.length || command.some(token => typeof token !== "string"))) {
      throw new CliError("INVALID_BATCH", "batch 需要非空的字符串命令数组，例如 [[\"view\",\"set\",\"ISO\"]]", 3);
    }
    const forbidden = new Set(["batch", "undo", "redo", "reset", "history"]);
    if (commands.some(command => forbidden.has(command[0]))) throw new CliError("INVALID_BATCH", "batch 内不能嵌套 batch、历史或 reset 命令", 3);
    const { project: previous } = await readProject(file);
    const directory = await mkdtemp(join(tmpdir(), "rooma-batch-"));
    const temporaryProject = join(directory, "project.json");
    try {
      await writeFile(temporaryProject, `${JSON.stringify(previous, null, 2)}\n`, "utf8");
      const results = [];
      for (const command of commands) {
        const outcome = await execute(temporaryProject, command);
        if (outcome.changed === false) throw new CliError("INVALID_BATCH", `batch 只接受写命令：${command.join(" ")}`, 3);
        results.push({ command: outcome.command, result: outcome.result });
      }
      const { project: next } = await readProject(temporaryProject);
      await commitMutation(file, previous, next, `批量执行 ${commands.length} 项操作`);
      return { command: "batch", ...mutationResult(next, { count: commands.length, operations: results }, undefined) };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  if (group === "assets") {
    const { positional, options } = parseOptions([action, ...tail].filter(value => value !== undefined));
    ensureNoExtraPositional(positional, 0);
    ensureOnlyOptions(options, ["category", "query"]);
    const assets = listAssets({ category: optionValue(options, "category"), query: optionValue(options, "query") });
    return { command: "assets", changed: false, result: { count: assets.length, assets } };
  }

  if (group === "status") {
    if (action !== undefined) throw new CliError("TOO_MANY_ARGUMENTS", `多余参数：${[action, ...tail].join(" ")}`, 2);
    const { project } = await readProject(file);
    return { command: "status", changed: false, project, result: projectSummary(project), openUrl: projectUrl(project) };
  }

  if (group === "validate") {
    if (action !== undefined) throw new CliError("TOO_MANY_ARGUMENTS", `多余参数：${[action, ...tail].join(" ")}`, 2);
    const { project } = await readProjectForValidation(file);
    const validation = validateProject(project);
    return { command: "validate", changed: false, project, result: validation, ok: validation.valid, exitCode: validation.valid ? 0 : 3 };
  }

  if (group === "url") {
    const { positional, options } = parseOptions([action, ...tail].filter(value => value !== undefined));
    ensureNoExtraPositional(positional, 0);
    ensureOnlyOptions(options, ["base"]);
    const { project } = await readProject(file);
    const openUrl = projectUrl(project, optionValue(options, "base"));
    return { command: "url", changed: false, project, result: { url: openUrl }, openUrl };
  }

  if (group === "object" && action === "list") {
    if (tail.length) throw new CliError("TOO_MANY_ARGUMENTS", `多余参数：${tail.join(" ")}`, 2);
    const { project } = await readProject(file);
    return { command: "object.list", changed: false, project, result: { count: project.objects.length, selectedObjectId: project.project.selectedObjectId, objects: project.objects } };
  }

  if (group === "object" && action === "inspect") {
    const { positional, options } = parseOptions(tail);
    ensureOnlyOptions(options, []); ensureNoExtraPositional(positional, 1);
    const reference = requirePositional(positional, 0, "对象 ID 或名称");
    const { project } = await readProject(file);
    return { command: "object.inspect", changed: false, project, result: inspectObject(project, reference) };
  }

  if (group === "object" && action === "add") {
    const { positional, options } = parseOptions(tail);
    ensureNoExtraPositional(positional, 1);
    ensureOnlyOptions(options, ["label", "id", "position", "x", "y", "z", "size", "width", "height", "depth"]);
    const kind = requirePositional(positional, 0, "素材 kind");
    const asset = getAsset(kind);
    if (!asset) throw new CliError("UNKNOWN_ASSET", `未知素材：${kind}`, 4);
    return { command: "object.add", ...await mutate(file, `添加 ${asset.label}`, project => {
      const id = optionValue(options, "id") || nextObjectId(project, kind);
      if (project.objects.some(object => object.id === id)) throw new CliError("DUPLICATE_ID", `对象 ID 已存在：${id}`, 5);
      const object = {
        id,
        kind,
        label: optionValue(options, "label") || asset.label,
        position: positionFromOptions(options),
        rotationY: 0,
        size: sizeFromOptions(asset, options),
      };
      if (!String(object.label).trim()) throw new CliError("INVALID_LABEL", "对象名称不能为空", 3);
      project.objects.push(object);
      project.project.selectedObjectId = id;
      return { object, warnings: objectOutsideRoom(project, object) ? ["对象超出当前房间边界"] : [] };
    }) };
  }

  if (group === "object" && action === "update") {
    const { positional, options } = parseOptions(tail);
    ensureNoExtraPositional(positional, 1);
    ensureOnlyOptions(options, ["label", "position", "x", "y", "z", "rotation", "rotation-y", "size", "width", "height", "depth"]);
    const reference = requirePositional(positional, 0, "对象 ID 或名称");
    if (!Object.keys(options).length) throw new CliError("NO_CHANGES", "object update 至少需要一个修改选项", 2);
    return { command: "object.update", ...await mutate(file, `更新 ${reference}`, project => {
      const object = resolveObject(project, reference);
      const asset = getAsset(object.kind);
      object.position = positionFromOptions(options, object.position);
      if (options.label !== undefined) {
        const label = String(optionValue(options, "label")).trim();
        if (!label) throw new CliError("INVALID_LABEL", "对象名称不能为空", 3);
        object.label = label;
      }
      if (options.rotation !== undefined || options["rotation-y"] !== undefined) object.rotationY = parseNumber(optionValue(options, options.rotation !== undefined ? "rotation" : "rotation-y"), "--rotation");
      if (["size", "width", "height", "depth"].some(key => options[key] !== undefined)) object.size = sizeFromOptions(asset, options, object.size);
      return { object, warnings: objectOutsideRoom(project, object) ? ["对象超出当前房间边界"] : [] };
    }) };
  }

  if (group === "object" && action === "remove") {
    const { positional, options } = parseOptions(tail);
    ensureOnlyOptions(options, []); ensureNoExtraPositional(positional, 1);
    const reference = requirePositional(positional, 0, "对象 ID 或名称");
    return { command: "object.remove", ...await mutate(file, `删除 ${reference}`, project => {
      const object = resolveObject(project, reference);
      project.objects = project.objects.filter(candidate => candidate.id !== object.id);
      if (project.project.selectedObjectId === object.id) project.project.selectedObjectId = null;
      return { removed: object };
    }) };
  }

  if (group === "object" && action === "duplicate") {
    const { positional, options } = parseOptions(tail);
    ensureOnlyOptions(options, ["label", "id", "offset"]); ensureNoExtraPositional(positional, 1);
    const reference = requirePositional(positional, 0, "对象 ID 或名称");
    return { command: "object.duplicate", ...await mutate(file, `复制 ${reference}`, project => {
      const source = resolveObject(project, reference);
      const id = optionValue(options, "id") || nextObjectId(project, source.kind);
      if (project.objects.some(object => object.id === id)) throw new CliError("DUPLICATE_ID", `对象 ID 已存在：${id}`, 5);
      const offset = options.offset === undefined ? { x: .25, y: 0, z: .25 } : parseVector(optionValue(options, "offset"), "--offset");
      const object = clone(source);
      object.id = id;
      object.label = optionValue(options, "label") || `${source.label} 副本`;
      object.position = { x: source.position.x + offset.x, y: source.position.y + offset.y, z: source.position.z + offset.z };
      project.objects.push(object);
      project.project.selectedObjectId = id;
      return { object, sourceId: source.id, warnings: objectOutsideRoom(project, object) ? ["对象超出当前房间边界"] : [] };
    }) };
  }

  if (group === "object" && action === "clearance") {
    const { positional, options } = parseOptions(tail);
    ensureOnlyOptions(options, []); ensureNoExtraPositional(positional, 3);
    const reference = requirePositional(positional, 0, "对象 ID 或名称");
    const direction = requirePositional(positional, 1, "方向");
    const targetDistance = parseNumber(requirePositional(positional, 2, "目标净距"), "目标净距");
    const key = directionKey(direction);
    return { command: "object.clearance", ...await mutate(file, `设置 ${reference} 的 ${direction} 净距`, project => {
      const object = resolveObject(project, reference);
      const before = inspectObject(project, object);
      const clearance = before.clearances.find(item => item.key === key);
      const movement = movementForTargetClearance(clearance, targetDistance);
      object.position[clearance.axis] += movement;
      const after = inspectObject(project, object);
      return {
        object,
        direction,
        targetDistance,
        movement: { axis: clearance.axis, delta: movement },
        reference: { id: clearance.referenceId, label: clearance.referenceLabel },
        clearance: after.clearances.find(item => item.key === key),
        warnings: objectOutsideRoom(project, object) ? ["对象超出当前房间边界"] : [],
      };
    }) };
  }

  if (group === "object") throw new CliError("UNKNOWN_COMMAND", `未知 object 命令：${action ?? ""}`, 2);

  if (group === "project" && action === "rename") {
    const name = tail.join(" ").trim();
    if (!name) throw new CliError("MISSING_ARGUMENT", "缺少项目名称", 2);
    return { command: "project.rename", ...await mutate(file, `项目重命名为 ${name}`, project => { project.project.name = name; return { name }; }) };
  }

  if (group === "room" && action === "set") {
    const { positional, options } = parseOptions(tail);
    ensureNoExtraPositional(positional, 0); ensureOnlyOptions(options, ["name", "width", "depth", "height"]);
    if (!Object.keys(options).length) throw new CliError("NO_CHANGES", "room set 至少需要一个修改选项", 2);
    return { command: "room.set", ...await mutate(file, "更新房间", project => {
      if (options.name !== undefined) {
        const name = String(optionValue(options, "name")).trim();
        if (!name) throw new CliError("INVALID_NAME", "房间名称不能为空", 3);
        project.project.room.name = name;
      }
      for (const field of ["width", "depth", "height"]) if (options[field] !== undefined) project.project.room[field] = parseNumber(optionValue(options, field), `--${field}`);
      if (project.project.room.width < ROOM_LIMITS.width.min || project.project.room.depth < ROOM_LIMITS.depth.min) throw new CliError("INVALID_ROOM_SIZE", `房间宽度和深度不能小于 ${ROOM_LIMITS.width.min} m`, 3);
      if (project.project.room.height < ROOM_LIMITS.height.min) throw new CliError("INVALID_ROOM_SIZE", `房间高度不能小于 ${ROOM_LIMITS.height.min} m`, 3);
      const outside = project.objects.filter(object => objectOutsideRoom(project, object)).map(object => ({ id: object.id, label: object.label }));
      return { room: project.project.room, warnings: outside.length ? ["调整后有对象超出房间边界"] : [], outsideObjects: outside };
    }) };
  }

  if (group === "view" && action === "set") {
    const value = requirePositional(tail, 0, "视图模式").toUpperCase();
    ensureNoExtraPositional(tail, 1);
    if (!["3D", "ISO", "2D"].includes(value)) throw new CliError("INVALID_VIEW", "视图必须是 3D、ISO 或 2D", 3);
    return { command: "view.set", ...await mutate(file, `切换到 ${value} 视图`, project => { project.project.view = value; return { view: value }; }) };
  }

  if (group === "theme" && action === "set") {
    const value = requirePositional(tail, 0, "主题").toLowerCase();
    ensureNoExtraPositional(tail, 1);
    if (!["blue", "red", "green", "mono"].includes(value)) throw new CliError("INVALID_THEME", "主题必须是 blue、red、green 或 mono", 3);
    return { command: "theme.set", ...await mutate(file, `切换到 ${value} 主题`, project => { project.project.colorMode = value; return { colorMode: value }; }) };
  }

  if (group === "measurements") {
    if (tail.length) throw new CliError("TOO_MANY_ARGUMENTS", `多余参数：${tail.join(" ")}`, 2);
    const value = action ?? "";
    return { command: "measurements", ...await mutate(file, "切换空间标注", project => {
      project.project.measurementsVisible = value === "toggle" ? !project.project.measurementsVisible : parseBoolean(value, "measurements");
      return { measurementsVisible: project.project.measurementsVisible };
    }) };
  }

  if (group === "select") {
    const reference = requirePositional([action, ...tail].filter(value => value !== undefined), 0, "对象 ID、名称或 none");
    ensureNoExtraPositional([action, ...tail].filter(value => value !== undefined), 1);
    return { command: "select", ...await mutate(file, `选择 ${reference}`, project => {
      const object = ["none", "null", "clear"].includes(reference.toLowerCase()) ? null : resolveObject(project, reference);
      project.project.selectedObjectId = object?.id ?? null;
      return { selectedObject: object ? { id: object.id, label: object.label } : null };
    }) };
  }

  if (group === "undo" || group === "redo") {
    if (action !== undefined) throw new CliError("TOO_MANY_ARGUMENTS", `多余参数：${[action, ...tail].join(" ")}`, 2);
    const { project } = await readProject(file);
    const restored = group === "undo" ? await undoMutation(file, project) : await redoMutation(file, project);
    return { command: group, ...mutationResult(restored.project, { description: restored.description }, undefined) };
  }

  if (group === "reset") {
    if (action !== undefined) throw new CliError("TOO_MANY_ARGUMENTS", `多余参数：${[action, ...tail].join(" ")}`, 2);
    const { project } = await readProject(file);
    const next = clone(DEFAULT_PROJECT);
    await commitMutation(file, project, next, "重置项目");
    return { command: "reset", ...mutationResult(next, { reset: true }, undefined) };
  }

  if (group === "history" && action === "clear") {
    if (tail.length) throw new CliError("TOO_MANY_ARGUMENTS", `多余参数：${tail.join(" ")}`, 2);
    await clearHistory(file);
    return { command: "history.clear", changed: true, result: { cleared: true } };
  }

  throw new CliError("UNKNOWN_COMMAND", `未知命令：${args.join(" ")}。运行 rooma help 查看用法。`, 2);
}

function humanOutput(payload) {
  if (payload.command === "help") return payload.result.help;
  const lines = [`✓ ${payload.command}${payload.changed ? " 已完成" : ""}`];
  if (payload.result) lines.push(JSON.stringify(payload.result, null, 2));
  if (payload.openUrl) lines.push(`打开 Web App：${payload.openUrl}`);
  return lines.join("\n");
}

async function main() {
  let globals = { json: process.argv.includes("--json") || process.argv.includes("-j"), file: resolve("rooma.project.json"), args: [] };
  try {
    globals = extractGlobals(process.argv.slice(2));
    const commandNeedsProject = ![undefined, "help", "--help", "-h", "assets"].includes(globals.args[0]);
    const outcome = commandNeedsProject ? await withProjectLock(globals.file, () => execute(globals.file, globals.args)) : await execute(globals.file, globals.args);
    const payload = { ok: outcome.ok ?? true, file: globals.file, ...outcome };
    delete payload.project;
    delete payload.exitCode;
    process.stdout.write(`${globals.json ? JSON.stringify(payload) : humanOutput(payload)}\n`);
    if (outcome.exitCode) process.exitCode = outcome.exitCode;
  } catch (error) {
    const normalized = error instanceof CliError ? error : new CliError("INTERNAL_ERROR", error?.message || String(error), 1);
    const payload = { ok: false, error: { code: normalized.code, message: normalized.message, ...(normalized.details === undefined ? {} : { details: normalized.details }) }, file: globals.file };
    const output = globals.json ? JSON.stringify(payload) : `错误 [${normalized.code}]：${normalized.message}`;
    (globals.json ? process.stdout : process.stderr).write(`${output}\n`);
    process.exitCode = normalized.exitCode;
  }
}

await main();
