import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";

export interface ProcessOptions {
  signal?: AbortSignal;
  timeoutMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  stdin?: string | Uint8Array;
  cwd?: string;
}

export interface ProcessResult {
  stdout: Buffer;
  stderr: Buffer;
  code: number | null;
}

export function controlledSignal(parent: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const abort = () => controller.abort(parent?.reason ?? new Error("Operation cancelled"));
  if (parent?.aborted) abort();
  else parent?.addEventListener("abort", abort, { once: true });

  const timer = setTimeout(
    () => controller.abort(new Error(`Operation timed out after ${timeoutMs}ms`)),
    timeoutMs,
  );
  timer.unref();

  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      parent?.removeEventListener("abort", abort);
    },
  };
}

export function runProcess(
  command: string,
  args: readonly string[],
  options: ProcessOptions,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const operation = controlledSignal(options.signal, options.timeoutMs);
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(command, [...args], {
        cwd: options.cwd,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      operation.dispose();
      reject(error);
      return;
    }

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let failure: Error | undefined;
    let killTimer: NodeJS.Timeout | undefined;

    const stop = (error: Error) => {
      if (!failure) failure = error;
      if (!child.killed) child.kill("SIGTERM");
      if (!killTimer) {
        killTimer = setTimeout(() => {
          if (child.exitCode === null) child.kill("SIGKILL");
        }, 500);
        killTimer.unref();
      }
    };

    const onAbort = () => {
      const reason = operation.signal.reason;
      stop(reason instanceof Error ? reason : new Error("Operation cancelled"));
    };
    operation.signal.addEventListener("abort", onAbort, { once: true });
    if (operation.signal.aborted) onAbort();

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > options.maxStdoutBytes) {
        stop(new Error(`Process stdout exceeded ${options.maxStdoutBytes} bytes`));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > options.maxStderrBytes) {
        stop(new Error(`Process stderr exceeded ${options.maxStderrBytes} bytes`));
        return;
      }
      stderr.push(chunk);
    });
    child.on("error", (error) => {
      failure ??= error;
    });
    child.on("close", (code) => {
      operation.signal.removeEventListener("abort", onAbort);
      operation.dispose();
      if (killTimer) clearTimeout(killTimer);
      if (failure) reject(failure);
      else resolve({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), code });
    });

    child.stdin.on("error", () => undefined);
    if (options.stdin === undefined) child.stdin.end();
    else child.stdin.end(options.stdin);
  });
}

export async function executableWorks(command: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const result = await runProcess(command, ["--version"], {
      signal,
      timeoutMs: 2_000,
      maxStdoutBytes: 16 * 1024,
      maxStderrBytes: 16 * 1024,
    });
    return result.code === 0;
  } catch (error) {
    if (signal?.aborted) throw error;
    return false;
  }
}
