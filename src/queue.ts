export class OriginQueue {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(origin: string, task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const previous = this.tails.get(origin) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.catch(() => undefined).then(() => gate);
    this.tails.set(origin, tail);
    let entered = false;

    const waitForPrevious = async () => {
      if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Operation cancelled");
      let onAbort: (() => void) | undefined;
      try {
        await Promise.race([
          previous.catch(() => undefined),
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
      await waitForPrevious();
      entered = true;
      return await task();
    } finally {
      // A cancelled waiter still releases its gate, but its tail remains chained
      // after the previous operation so it cannot let a later waiter run early.
      release();
      if (this.tails.get(origin) === tail) {
        if (entered) this.tails.delete(origin);
        else void tail.then(() => {
          if (this.tails.get(origin) === tail) this.tails.delete(origin);
        });
      }
    }
  }

  get size(): number {
    return this.tails.size;
  }
}
