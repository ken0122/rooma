import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { CliError, HISTORY_LIMIT, assertValidProject, clone } from "./core.mjs";

export function absoluteProjectPath(file) {
  return resolve(file || "rooma.project.json");
}

export function historyPathFor(file) {
  const absolute = absoluteProjectPath(file);
  const configuredDirectory = process.env.ROOMA_HISTORY_DIR;
  return configuredDirectory
    ? join(resolve(configuredDirectory), `${basename(absolute)}.history.json`)
    : `${absolute}.history.json`;
}

export async function readJson(file, kind) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") throw new CliError("FILE_NOT_FOUND", `找不到${kind}：${file}`, 4);
    if (error instanceof SyntaxError) throw new CliError("INVALID_JSON", `${kind}不是有效 JSON：${file}`, 3);
    throw new CliError("FILE_READ_FAILED", `无法读取${kind}：${file}（${error.message}）`, 7);
  }
}

export async function readProject(file) {
  const absolute = absoluteProjectPath(file);
  return { file: absolute, project: assertValidProject(await readJson(absolute, "项目文件")) };
}

export async function atomicWriteJson(file, value) {
  const absolute = resolve(file);
  const directory = dirname(absolute);
  const temporary = join(directory, `.${basename(absolute)}.${process.pid}.${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, absolute);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw new CliError("FILE_WRITE_FAILED", `无法原子写入文件：${absolute}（${error.message}）`, 7);
  }
}

export async function readHistory(file) {
  const historyFile = historyPathFor(file);
  try {
    const history = JSON.parse(await readFile(historyFile, "utf8"));
    if (!history || history.schemaVersion !== 1 || !Array.isArray(history.undo) || !Array.isArray(history.redo)) throw new Error("invalid history schema");
    return { file: historyFile, history };
  } catch (error) {
    if (error?.code === "ENOENT") return { file: historyFile, history: { schemaVersion: 1, undo: [], redo: [] } };
    throw new CliError("HISTORY_READ_FAILED", `无法读取历史记录：${historyFile}（${error.message}）`, 7);
  }
}

export async function commitMutation(file, previous, next, description) {
  assertValidProject(next);
  const { file: historyFile, history } = await readHistory(file);
  history.undo.push({ description, project: clone(previous) });
  if (history.undo.length > HISTORY_LIMIT) history.undo.splice(0, history.undo.length - HISTORY_LIMIT);
  history.redo = [];
  await atomicWriteJson(file, next);
  await atomicWriteJson(historyFile, history);
}

export async function undoMutation(file, current) {
  const { file: historyFile, history } = await readHistory(file);
  const entry = history.undo.pop();
  if (!entry) throw new CliError("NOTHING_TO_UNDO", "没有可撤销的操作", 4);
  assertValidProject(entry.project);
  history.redo.push({ description: entry.description, project: clone(current) });
  if (history.redo.length > HISTORY_LIMIT) history.redo.splice(0, history.redo.length - HISTORY_LIMIT);
  await atomicWriteJson(file, entry.project);
  await atomicWriteJson(historyFile, history);
  return { project: entry.project, description: entry.description };
}

export async function redoMutation(file, current) {
  const { file: historyFile, history } = await readHistory(file);
  const entry = history.redo.pop();
  if (!entry) throw new CliError("NOTHING_TO_REDO", "没有可重做的操作", 4);
  assertValidProject(entry.project);
  history.undo.push({ description: entry.description, project: clone(current) });
  if (history.undo.length > HISTORY_LIMIT) history.undo.splice(0, history.undo.length - HISTORY_LIMIT);
  await atomicWriteJson(file, entry.project);
  await atomicWriteJson(historyFile, history);
  return { project: entry.project, description: entry.description };
}

export async function clearHistory(file) {
  const historyFile = historyPathFor(file);
  await rm(historyFile, { force: true });
}
