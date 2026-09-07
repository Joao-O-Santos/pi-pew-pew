import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LIMITS } from "./constants.js";
import { executableWorks, runProcess } from "./process.js";

export interface ChromiumResult {
  executable: string;
  dom?: string;
  screenshot?: Buffer;
}

export class Chromium {
  private discovered?: Promise<string | undefined>;

  async executable(signal?: AbortSignal): Promise<string> {
    this.discovered ??= this.findExecutable(signal);
    let executable: string | undefined;
    try {
      executable = await this.discovered;
    } catch (error) {
      if (signal?.aborted) this.discovered = undefined;
      throw error;
    }
    if (!executable) {
      throw new Error(
        "PEW-PEW: Chromium could not render this page. Try an interactive browser tool such as pi-chrome-use if the task requires browser automation or manual interaction.",
      );
    }
    return executable;
  }

  private async findExecutable(signal?: AbortSignal): Promise<string | undefined> {
    const candidates = [
      process.env.PEW_PEW_CHROMIUM,
      "chromium",
      "chromium-browser",
      "google-chrome",
    ].filter((value): value is string => Boolean(value));
    for (const candidate of candidates) {
      if (await executableWorks(candidate, signal)) return candidate;
    }
    return undefined;
  }

  async render(url: string, signal: AbortSignal): Promise<ChromiumResult> {
    const executable = await this.executable(signal);
    const result = await runProcess(executable, [
      "--headless=new",
      "--disable-gpu",
      "--dump-dom",
      url,
    ], {
      signal,
      timeoutMs: LIMITS.chromiumTimeoutMs,
      maxStdoutBytes: LIMITS.chromiumBytes,
      maxStderrBytes: LIMITS.processStderrBytes,
    });
    if (result.code !== 0) {
      throw new Error(`PEW-PEW: Chromium failed to render the page (exit code ${result.code})`);
    }
    return { executable, dom: result.stdout.toString("utf8") };
  }

  async screenshot(url: string, signal: AbortSignal): Promise<ChromiumResult> {
    const executable = await this.executable(signal);
    const directory = await mkdtemp(join(tmpdir(), "pi-pew-pew-"));
    const path = join(directory, "screenshot.png");
    try {
      const result = await runProcess(executable, [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--window-size=1280,900",
        `--screenshot=${path}`,
        url,
      ], {
        signal,
        timeoutMs: LIMITS.chromiumTimeoutMs,
        maxStdoutBytes: 64 * 1024,
        maxStderrBytes: LIMITS.processStderrBytes,
      });
      if (result.code !== 0) {
        throw new Error(`PEW-PEW: Chromium failed to take a screenshot (exit code ${result.code})`);
      }
      const metadata = await stat(path);
      if (metadata.size === 0 || metadata.size > LIMITS.screenshotBytes) {
        throw new Error("PEW-PEW: Chromium produced an invalid or oversized screenshot");
      }
      return { executable, screenshot: await readFile(path) };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
