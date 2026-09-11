import { LIMITS } from "./constants.js";
import { runProcess } from "./process.js";
import type { WebDetails } from "./types.js";

export interface ConvertedBody {
  text: string;
  format: NonNullable<WebDetails["format"]>;
  pandoc: NonNullable<WebDetails["pandoc"]>;
  truncated: boolean;
}

function truncateUtf8(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  let output = Buffer.from(text).subarray(0, maxBytes).toString("utf8");
  while (Buffer.byteLength(output) > maxBytes) output = output.slice(0, -1);
  return output;
}

export function limitText(
  text: string,
  maxBytes = LIMITS.outputBytes,
  maxLines = LIMITS.outputLines,
): { text: string; truncated: boolean } {
  const lines = text.split("\n");
  let output = lines.slice(0, maxLines).join("\n");
  const truncated = lines.length > maxLines || Buffer.byteLength(output) > maxBytes;
  if (!truncated) return { text: output, truncated: false };

  const notice = maxLines > 1 ? "\n\n[PEW-PEW: output truncated]" : "[PEW-PEW: output truncated]";
  const reservedLines = notice.split("\n").length - 1;
  output = lines.slice(0, Math.max(0, maxLines - reservedLines)).join("\n");
  const budget = Math.max(0, maxBytes - Buffer.byteLength(notice));
  output = truncateUtf8(output, budget);
  return { text: truncateUtf8(`${output}${notice}`, maxBytes), truncated: true };
}

export function pandocCandidates(explicit = process.env.PEW_PEW_PANDOC): string[] {
  return [...new Set([explicit, "pandoc"].filter((value): value is string => Boolean(value)))];
}

const URL_ATTRIBUTE = /(\b(?:href|src)\s*=\s*)(["'])([^"']*)\2/gi;

export function absolutizeHtmlLinks(html: string, baseUrl: string): string {
  return html.replace(URL_ATTRIBUTE, (attribute, prefix, quote, value: string) => {
    if (!value) return attribute;
    try {
      const resolved = new URL(value, baseUrl);
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return attribute;
      return `${prefix}${quote}${resolved.href}${quote}`;
    } catch {
      return attribute;
    }
  });
}

export async function htmlToMarkdown(
  html: string,
  baseUrl: string,
  signal: AbortSignal,
  pandocExecutable: () => Promise<string | undefined>,
): Promise<ConvertedBody> {
  const navigableHtml = absolutizeHtmlLinks(html, baseUrl);
  const executable = await pandocExecutable();
  if (!executable) {
    const limited = limitText(navigableHtml);
    return { ...limited, format: "html", pandoc: "unavailable" };
  }

  try {
    const result = await runProcess(
      executable,
      ["--from=html", "--to=gfm-raw_html", "--wrap=none"],
      {
        signal,
        timeoutMs: LIMITS.pandocTimeoutMs,
        maxStdoutBytes: LIMITS.outputBytes,
        maxStderrBytes: LIMITS.processStderrBytes,
        stdin: navigableHtml,
      },
    );
    if (result.code !== 0)
      throw new Error(result.stderr.toString("utf8").trim() || `exit code ${result.code}`);
    const limited = limitText(result.stdout.toString("utf8"));
    return { ...limited, format: "markdown", pandoc: "converted" };
  } catch (error) {
    if (signal.aborted) throw error;
    const limited = limitText(
      `${navigableHtml}\n\n[PEW-PEW: Pandoc conversion failed; showing HTML]`,
    );
    return { ...limited, format: "html", pandoc: "failed" };
  }
}
