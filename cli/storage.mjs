import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { CliError, HISTORY_LIMIT, assertValidProject, clone } from "./core.mjs";

export function absoluteProjectPath(file) {
  return resolve(file || "rooma.project.json");
}

export function historyPathFor(file) {
  const absolute = absoluteProjectPath(file);
  const configuredDirectory = process.env.ROOMA_HISTORY_DIR;
  const projectHash = createHash("sha256").update(absolute).digest("hex").slice(0, 12);
  return configuredDirectory
    ? join(resolve(configuredDirectory), `${basename(absolute)}.${projectHash}.history.json`)
    : `${absolute}.history.json`;
}

export const journalPathFor = file => `${historyPathFor(file)}.journal`;
export const lockPathFor = file => `${absoluteProjectPath(file)}.lock`;

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

export async function readProjectForValidation(file) {
  const absolute = absoluteProjectPath(file);
  return { file: absolute, project: await readJson(absolute, "项目文件") };
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

async function atomicCommitProjectAndHistory(file, project, historyFile, history) {
  const absolute = absoluteProjectPath(file);
  const journalFile = journalPathFor(absolute);
  await atomicWriteJson(journalFile, {
    schemaVersion: 1,
    projectFile: absolute,
    historyFile,
    project,
    history,
  });
  await atomicWriteJson(absolute, project);
  await atomicWriteJson(historyFile, history);
  await rm(journalFile, { force: true });
}

export async function recoverPendingCommit(file) {
  const absolute = absoluteProjectPath(file);
  const journalFile = journalPathFor(absolute);
  let journal;
  try {
    journal = JSON.parse(await readFile(journalFile, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw new CliError("RECOVERY_FAILED", `无法读取事务日志：${journalFile}（${error.message}）`, 7);
  }
  const expectedHistoryFile = historyPathFor(absolute);
  if (!journal || journal.schemaVersion !== 1 || journal.projectFile !== absolute || journal.historyFile !== expectedHistoryFile || !journal.history || !Array.isArray(journal.history.undo) || !Array.isArray(journal.history.redo)) {
    throw new CliError("RECOVERY_FAILED", `事务日志与当前工程不匹配：${journalFile}`, 7);
  }
  assertValidProject(journal.project);
  await atomicWriteJson(absolute, journal.project);
  await atomicWriteJson(expectedHistoryFile, journal.history);
  await rm(journalFile, { force: true });
  return true;
}

const wait = milliseconds => new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));

async function lockOwnerIsAlive(lockFile) {
  try {
    const lock = JSON.parse(await readFile(lockFile, "utf8"));
    if (!Number.isInteger(lock.pid) || lock.pid <= 0) return false;
    process.kill(lock.pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

export async function withProjectLock(file, action) {
  const absolute = absoluteProjectPath(file);
  const lockFile = lockPathFor(absolute);
  const deadline = Date.now() + 5_000;
  let handle;
  while (!handle) {
    try {
      const candidate = await open(lockFile, "wx", 0o600);
      try {
        await candidate.writeFile(`${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`, "utf8");
        handle = candidate;
      } catch (error) {
        await candidate.close().catch(() => {});
        await rm(lockFile, { force: true }).catch(() => {});
        throw error;
      }
    } catch (error) {
      if (error?.code !== "EEXIST") throw new CliError("LOCK_FAILED", `无法锁定工程：${absolute}（${error.message}）`, 7);
      const details = await stat(lockFile).catch(() => null);
      if (details && Date.now() - details.mtimeMs > 30_000 && !(await lockOwnerIsAlive(lockFile))) {
        await rm(lockFile, { force: true });
        continue;
      }
      if (Date.now() >= deadline) throw new CliError("PROJECT_LOCKED", `工程正在被其他进程修改：${absolute}`, 8);
      await wait(25);
    }
  }
  try {
    await recoverPendingCommit(absolute);
    return await action();
  } finally {
    await handle.close().catch(() => {});
    await rm(lockFile, { force: true }).catch(() => {});
  }
}

export async function commitMutation(file, previous, next, description) {
  assertValidProject(next);
  const { file: historyFile, history } = await readHistory(file);
  history.undo.push({ description, project: clone(previous) });
  if (history.undo.length > HISTORY_LIMIT) history.undo.splice(0, history.undo.length - HISTORY_LIMIT);
  history.redo = [];
  await atomicCommitProjectAndHistory(file, next, historyFile, history);
}

export async function undoMutation(file, current) {
  const { file: historyFile, history } = await readHistory(file);
  const entry = history.undo.pop();
  if (!entry) throw new CliError("NOTHING_TO_UNDO", "没有可撤销的操作", 4);
  assertValidProject(entry.project);
  history.redo.push({ description: entry.description, project: clone(current) });
  if (history.redo.length > HISTORY_LIMIT) history.redo.splice(0, history.redo.length - HISTORY_LIMIT);
  await atomicCommitProjectAndHistory(file, entry.project, historyFile, history);
  return { project: entry.project, description: entry.description };
}

export async function redoMutation(file, current) {
  const { file: historyFile, history } = await readHistory(file);
  const entry = history.redo.pop();
  if (!entry) throw new CliError("NOTHING_TO_REDO", "没有可重做的操作", 4);
  assertValidProject(entry.project);
  history.undo.push({ description: entry.description, project: clone(current) });
  if (history.undo.length > HISTORY_LIMIT) history.undo.splice(0, history.undo.length - HISTORY_LIMIT);
  await atomicCommitProjectAndHistory(file, entry.project, historyFile, history);
  return { project: entry.project, description: entry.description };
}

export async function clearHistory(file) {
  const historyFile = historyPathFor(file);
  await rm(historyFile, { force: true });
  await rm(journalPathFor(file), { force: true });
}
