import { PACING_MS } from "./constants.js";

function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      const reason = signal?.reason;
      done(reason instanceof Error ? reason : new Error("Operation cancelled"));
    };
    function done(error?: Error) {
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

export class OriginQueue {
  private readonly tails = new Map<string, Promise<void>>();
  private readonly requestedGaps = new Map<string, number>();
  private readonly deferredUntil = new Map<string, number>();

  constructor(private readonly minimumGapMs = PACING_MS) {}

  pace(origin: string, minimumGapMs: number): void {
    const current = this.requestedGaps.get(origin) ?? this.minimumGapMs;
    this.requestedGaps.set(origin, Math.max(current, minimumGapMs));
  }

  defer(origin: string, milliseconds: number): void {
    this.deferredUntil.set(origin, Math.max(this.deferredUntil.get(origin) ?? 0, Date.now() + milliseconds));
  }

  async run<T>(origin: string, task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const previous = this.tails.get(origin) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.catch(() => undefined).then(() => gate);
    this.tails.set(origin, tail);
    let entered = false;

    const waitFor = async (pending: Promise<void>) => {
      if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Operation cancelled");
      let onAbort: (() => void) | undefined;
      try {
        await Promise.race([
          pending,
          new Promise<void>((_, reject) => {
            onAbort = () => reject(signal!.reason instanceof Error ? signal!.reason : new Error("Operation cancelled"));
            signal?.addEventListener("abort", onAbort, { once: true });
          }),
        ]);
      } finally {
        if (onAbort) signal?.removeEventListener("abort", onAbort);
      }
    };

    try {
      await waitFor(previous.catch(() => undefined));
      const deferred = this.deferredUntil.get(origin);
      if (deferred) {
        const remaining = deferred - Date.now();
        if (remaining > 0) await sleep(remaining, signal);
        if (this.deferredUntil.get(origin) === deferred) this.deferredUntil.delete(origin);
      }
      entered = true;
      return await task();
    } finally {
      // A completed operation holds the origin gate for its pacing gap, while
      // its caller receives the result immediately. A cancelled waiter never
      // entered the gate, so it must not impose a delay of its own.
      const gap = entered ? this.requestedGaps.get(origin) ?? this.minimumGapMs : 0;
      this.requestedGaps.delete(origin);
      if (gap > 0) void sleep(gap).then(release, release);
      else release();
      if (this.tails.get(origin) === tail) {
        void tail.then(() => {
          if (this.tails.get(origin) === tail) this.tails.delete(origin);
        });
      }
    }
  }

  get size(): number {
    return this.tails.size;
  }
}
