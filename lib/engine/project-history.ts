export type ProjectHistoryEntry<T> = {
  before: T | null;
  after: T | null;
};

export class ProjectHistory<T> {
  private readonly limit: number;
  private readonly undoEntries: Array<ProjectHistoryEntry<T>> = [];
  private readonly redoEntries: Array<ProjectHistoryEntry<T>> = [];

  constructor(limit = 100) {
    this.limit = Math.max(1, limit);
  }

  get canUndo() {
    return this.undoEntries.length > 0;
  }

  get canRedo() {
    return this.redoEntries.length > 0;
  }

  record(entry: ProjectHistoryEntry<T>) {
    this.undoEntries.push(entry);
    if (this.undoEntries.length > this.limit) this.undoEntries.shift();
    this.redoEntries.length = 0;
  }

  takeUndo() {
    const entry = this.undoEntries.pop() ?? null;
    if (entry) this.redoEntries.push(entry);
    return entry;
  }

  takeRedo() {
    const entry = this.redoEntries.pop() ?? null;
    if (entry) this.undoEntries.push(entry);
    return entry;
  }
}
