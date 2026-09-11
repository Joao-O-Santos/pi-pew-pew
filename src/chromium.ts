import { mkdtemp, mkdir, readFile, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { LIMITS } from "./constants.js";
import { executableWorks, runProcess } from "./process.js";

export interface ChromiumResult {
  dom?: string;
  screenshot?: Buffer;
}

export const SCREENSHOT_VIEWPORT = { width: 1280, height: 900, fullPage: false } as const;

export function chromiumProfilePath(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): string {
  const explicit = env.PEW_PEW_CHROMIUM_PROFILE?.trim();
  if (explicit) return resolve(explicit);
  const config = env.XDG_CONFIG_HOME?.trim()
    ? resolve(env.XDG_CONFIG_HOME)
    : join(home, ".config");
  return join(config, "pi", "pi-pew-pew", "chromium");
}

export function chromiumArguments(
  args: string[],
  url: string,
  profile = chromiumProfilePath(),
): string[] {
  return ["--headless=new", "--disable-gpu", `--user-data-dir=${profile}`, ...args, url];
}

export class Chromium {
  private discovered?: Promise<string | undefined>;

  constructor(private readonly profile = chromiumProfilePath()) {}

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

  private async run(
    url: string,
    signal: AbortSignal,
    action: string,
    args: string[],
    maxStdoutBytes: number,
  ) {
    const executable = await this.executable(signal);
    await mkdir(this.profile, { recursive: true, mode: 0o700 });
    const result = await runProcess(executable, chromiumArguments(args, url, this.profile), {
      signal,
      timeoutMs: LIMITS.chromiumTimeoutMs,
      maxStdoutBytes,
      maxStderrBytes: LIMITS.processStderrBytes,
    });
    if (result.code !== 0)
      throw new Error(`PEW-PEW: Chromium failed to ${action} (exit code ${result.code})`);
    return result;
  }

  async render(url: string, signal: AbortSignal): Promise<ChromiumResult> {
    const result = await this.run(
      url,
      signal,
      "render the page",
      ["--dump-dom"],
      LIMITS.chromiumBytes,
    );
    return { dom: result.stdout.toString("utf8") };
  }

  async screenshot(url: string, signal: AbortSignal): Promise<ChromiumResult> {
    const directory = await mkdtemp(join(tmpdir(), "pi-pew-pew-"));
    const path = join(directory, "screenshot.png");
    try {
      await this.run(
        url,
        signal,
        "take a screenshot",
        [
          "--hide-scrollbars",
          `--window-size=${SCREENSHOT_VIEWPORT.width},${SCREENSHOT_VIEWPORT.height}`,
          `--screenshot=${path}`,
        ],
        64 * 1024,
      );
      const metadata = await stat(path);
      if (metadata.size === 0 || metadata.size > LIMITS.screenshotBytes) {
        throw new Error("PEW-PEW: Chromium produced an invalid or oversized screenshot");
      }
      return { screenshot: await readFile(path) };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
