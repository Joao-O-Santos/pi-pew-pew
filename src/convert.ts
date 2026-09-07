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
  let truncated = lines.length > maxLines || Buffer.byteLength(output) > maxBytes;
  if (!truncated) return { text: output, truncated: false };

  const notice = "\n\n[PEW-PEW: output truncated]";
  const budget = Math.max(0, maxBytes - Buffer.byteLength(notice));
  output = truncateUtf8(output, budget);
  return { text: truncateUtf8(`${output}${notice}`, maxBytes), truncated: true };
}

export async function htmlToMarkdown(
  html: string,
  signal: AbortSignal,
  pandocAvailable: () => Promise<boolean>,
): Promise<ConvertedBody> {
  if (!(await pandocAvailable())) {
    const limited = limitText(html);
    return { ...limited, format: "html", pandoc: "unavailable" };
  }

  try {
    const result = await runProcess("pandoc", ["-f", "html", "-t", "gfm"], {
      signal,
      timeoutMs: LIMITS.fetchTimeoutMs,
      maxStdoutBytes: LIMITS.outputBytes,
      maxStderrBytes: LIMITS.processStderrBytes,
      stdin: html,
    });
    if (result.code !== 0) throw new Error(result.stderr.toString("utf8").trim() || `exit code ${result.code}`);
    const limited = limitText(result.stdout.toString("utf8"));
    return { ...limited, format: "markdown", pandoc: "converted" };
  } catch (error) {
    if (signal.aborted) throw error;
    const limited = limitText(html);
    return {
      ...limited,
      format: "html",
      pandoc: "failed",
      text: `${limited.text}\n\n[PEW-PEW: Pandoc conversion failed; showing HTML]`,
    };
  }
}

