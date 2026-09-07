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

export function pandocCandidates(explicit = process.env.PEW_PEW_PANDOC): string[] {
  return [...new Set([explicit, "pandoc"].filter((value): value is string => Boolean(value)))];
}

export async function htmlToMarkdown(
  html: string,
  signal: AbortSignal,
  pandocExecutable: () => Promise<string | undefined>,
): Promise<ConvertedBody> {
  const executable = await pandocExecutable();
  if (!executable) {
    const limited = limitText(html);
    return { ...limited, format: "html", pandoc: "unavailable" };
  }

  try {
    const result = await runProcess(executable, ["--from=html", "--to=gfm", "--wrap=none"], {
      signal,
      timeoutMs: LIMITS.pandocTimeoutMs,
      maxStdoutBytes: LIMITS.outputBytes,
      maxStderrBytes: LIMITS.processStderrBytes,
      stdin: html,
    });
    if (result.code !== 0) throw new Error(result.stderr.toString("utf8").trim() || `exit code ${result.code}`);
    const limited = limitText(result.stdout.toString("utf8"));
    return { ...limited, format: "markdown", pandoc: "converted" };
  } catch (error) {
    if (signal.aborted) throw error;
    const limited = limitText(`${html}\n\n[PEW-PEW: Pandoc conversion failed; showing HTML]`);
    return { ...limited, format: "html", pandoc: "failed" };
  }
}
