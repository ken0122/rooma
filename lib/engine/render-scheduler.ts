export type FrameStats = {
  frameMs: number;
};

export type RenderSchedulerOptions = {
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (id: number) => void;
  now: () => number;
  update: () => boolean;
  render: () => void;
  refreshShadows: () => void;
  onFrame?: (stats: FrameStats) => void;
};

export class RenderScheduler {
  private frameId = 0;
  private shadowsDirty = true;
  private destroyed = false;
  private readonly options: RenderSchedulerOptions;

  constructor(options: RenderSchedulerOptions) {
    this.options = options;
  }

  get pending() {
    return this.frameId !== 0;
  }

  invalidate({ shadows = false }: { shadows?: boolean } = {}) {
    if (shadows) this.shadowsDirty = true;
    if (this.destroyed || this.frameId) return;
    this.frameId = this.options.requestFrame(this.runFrame);
  }

  dispose() {
    this.destroyed = true;
    if (this.frameId) this.options.cancelFrame(this.frameId);
    this.frameId = 0;
  }

  private readonly runFrame: FrameRequestCallback = () => {
    if (this.destroyed) return;
    this.frameId = 0;
    const started = this.options.now();
    const needsContinuation = this.options.update();
    if (this.shadowsDirty) {
      this.options.refreshShadows();
      this.shadowsDirty = false;
    }
    this.options.render();
    this.options.onFrame?.({ frameMs: this.options.now() - started });
    if (needsContinuation) this.invalidate();
  };
}
