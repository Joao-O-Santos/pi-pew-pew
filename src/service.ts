import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Chromium, SCREENSHOT_VIEWPORT } from "./chromium.js";
import { LIMITS } from "./constants.js";
import { htmlToMarkdown, limitText, pandocCandidates } from "./convert.js";
import { ExaCache } from "./exa.js";
import { parseWebUrl } from "./http.js";
import { controlledSignal, executableWorks } from "./process.js";
import { type WebDetails, WebFailureError, type WebMode, type WebResult } from "./types.js";

function metadata(details: WebDetails): string {
  const lines = [
    `PEW-PEW web result: ${details.mode}`,
    `source: ${details.source ?? "unknown"}`,
    `requested URL: ${details.requestedUrl}`,
    `final URL: ${details.finalUrl ?? "(unknown)"}`,
  ];
  if (details.status !== undefined) lines.push(`provider HTTP status: ${details.status}`);
  if (details.contentType) lines.push(`content type: ${details.contentType}`);
  if (details.pandoc) lines.push(`Pandoc: ${details.pandoc}`);
  if (details.retryAfter) lines.push(`Retry-After: ${details.retryAfter}`);
  if (details.reason) lines.push(`reason: ${details.reason}`);
  if (details.capture)
    lines.push(
      `capture: ${details.capture.width}x${details.capture.height} viewport; full page: ${details.capture.fullPage ? "yes" : "no"}`,
    );
  if (details.suggestedMode) lines.push(`suggested mode: ${details.suggestedMode}`);
  return lines.join("\n");
}

export class WebService {
  private pandoc?: Promise<string | undefined>;

  constructor(
    private readonly cache: Pick<ExaCache, "get"> = new ExaCache(),
    private readonly chromium: Pick<Chromium, "render" | "screenshot"> = new Chromium(),
  ) {}

  private async findPandoc(signal: AbortSignal): Promise<string | undefined> {
    for (const candidate of pandocCandidates()) {
      if (await executableWorks(candidate, signal)) return candidate;
    }
    return undefined;
  }

  private async pandocExecutable(signal: AbortSignal): Promise<string | undefined> {
    this.pandoc ??= this.findPandoc(signal);
    try {
      return await this.pandoc;
    } catch (error) {
      if (signal.aborted) this.pandoc = undefined;
      throw error;
    }
  }

  async execute(
    requestedUrl: string,
    mode: WebMode,
    parentSignal?: AbortSignal,
  ): Promise<WebResult> {
    const initial = parseWebUrl(requestedUrl, { allowFile: mode === "screenshot" });
    const operation = controlledSignal(
      parentSignal,
      mode === "fetch" ? LIMITS.fetchTimeoutMs : LIMITS.chromiumTimeoutMs,
    );
    try {
      if (initial.protocol === "file:") {
        return await this.retrieveLocalScreenshot(initial, operation.signal);
      }
      if (mode === "fetch") return await this.retrieveCached(initial.href, operation.signal);
      if (mode === "render") return await this.render(initial.href, operation.signal);
      return await this.retrieveScreenshot(initial.href, operation.signal);
    } catch (error) {
      if (!(error instanceof WebFailureError)) throw error;
      const details: WebDetails = {
        outcome: "failed",
        mode,
        requestedUrl: initial.href,
        ...error.details,
      };
      return {
        content: [
          {
            type: "text",
            text: `${metadata(details)}\n\nPEW-PEW: retrieval failed without an automatic retry.`,
          },
        ],
        details,
      };
    } finally {
      operation.dispose();
    }
  }

  private async retrieveCached(url: string, signal: AbortSignal): Promise<WebResult> {
    const page = await this.cache.get(url, signal);
    const body = limitText(page.text);
    const details: WebDetails = {
      outcome: "ok",
      mode: "fetch",
      source: "exa",
      requestedUrl: url,
      finalUrl: page.url,
      contentType: "text/plain",
      format: "text",
      truncated: body.truncated,
    };
    const title = page.title ? `\ntitle: ${page.title}` : "";
    return {
      content: [
        {
          type: "text",
          text: `${metadata(details)}${title}\n\n===== BEGIN cached page =====\n${body.text}\n===== END cached page =====`,
        },
      ],
      details,
    };
  }

  private async render(url: string, signal: AbortSignal): Promise<WebResult> {
    const raw = (await this.chromium.render(url, signal)).dom ?? "";
    const conversion = await htmlToMarkdown(raw, url, signal, () => this.pandocExecutable(signal));
    const details: WebDetails = {
      outcome: "ok",
      mode: "render",
      source: "chromium",
      requestedUrl: url,
      contentType: "text/html",
      ...conversion,
    };
    return {
      content: [
        {
          type: "text",
          text: `${metadata(details)}\n\n===== BEGIN rendered page =====\n${conversion.text}\n===== END rendered page =====`,
        },
      ],
      details,
    };
  }

  private async captureScreenshot(
    url: string,
    signal: AbortSignal,
  ): Promise<Extract<WebResult["content"][number], { type: "image" }>> {
    const screenshot = await this.chromium.screenshot(url, signal);
    if (!screenshot.screenshot) throw new Error("PEW-PEW: Chromium did not produce a screenshot");
    return {
      type: "image",
      data: screenshot.screenshot.toString("base64"),
      mimeType: "image/png",
    };
  }

  private async retrieveScreenshot(url: string, signal: AbortSignal): Promise<WebResult> {
    const details: WebDetails = {
      outcome: "ok",
      mode: "screenshot",
      source: "chromium",
      requestedUrl: url,
      contentType: "image/png",
      format: "image",
      capture: SCREENSHOT_VIEWPORT,
    };
    const image = await this.captureScreenshot(url, signal);
    return { content: [{ type: "text", text: metadata(details) }, image], details };
  }

  private async retrieveLocalScreenshot(url: URL, signal: AbortSignal): Promise<WebResult> {
    let path: string;
    try {
      path = fileURLToPath(url);
    } catch {
      throw new Error(`PEW-PEW: local file URL must refer to a local path: ${url.href}`);
    }
    let file: Awaited<ReturnType<typeof stat>>;
    try {
      file = await stat(path);
    } catch {
      throw new Error(`PEW-PEW: local file could not be read: ${url.href}`);
    }
    if (!file.isFile()) throw new Error(`PEW-PEW: local path is not a regular file: ${url.href}`);
    if (file.size > LIMITS.localFileBytes) {
      throw new Error(`PEW-PEW: local file exceeds the ${LIMITS.localFileBytes}-byte limit`);
    }

    const details: WebDetails = {
      outcome: "ok",
      mode: "screenshot",
      source: "local",
      requestedUrl: url.href,
      finalUrl: url.href,
      contentType: "image/png",
      format: "image",
      capture: SCREENSHOT_VIEWPORT,
    };
    const image = await this.captureScreenshot(url.href, signal);
    return { content: [{ type: "text", text: metadata(details) }, image], details };
  }
}
