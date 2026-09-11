import { REDIRECT_STATUSES, REFUSAL_STATUSES, TOS_REL } from "./constants.js";
import type { LlmsResult, RobotsResult } from "./types.js";

export type FetchImplementation = typeof globalThis.fetch;

export interface Authorization {
  robots: RobotsResult;
  llms: LlmsResult;
}

export interface HttpResult {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  retryAfter?: string;
  body: Uint8Array;
  authorization: Authorization;
  termsOfService?: string;
}

export function parseWebUrl(input: string, options: { allowFile?: boolean } = {}): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`PEW-PEW: malformed URL: ${input}`);
  }
  const supported = url.protocol === "http:" || url.protocol === "https:";
  const localFile = options.allowFile && url.protocol === "file:";
  if (!supported && !localFile) {
    throw new Error(
      `PEW-PEW: unsupported URL protocol ${url.protocol || "(none)"}; use HTTP or HTTPS${options.allowFile ? " or a local file for screenshots" : ""}`,
    );
  }
  if (!localFile) url.hash = "";
  return url;
}

function hasTermsOfServiceToken(value: string | undefined): boolean {
  return value?.split(/\s+/).some((token) => token.toLowerCase() === TOS_REL) ?? false;
}

function splitOutsideQuotes(value: string, separator: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let quote: string | undefined;
  let angleDepth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") quote = character;
    else if (character === "<") angleDepth += 1;
    else if (character === ">") angleDepth = Math.max(0, angleDepth - 1);
    else if (character === separator && angleDepth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function hasTermsOfServiceLinkRel(value: string): boolean {
  for (const parameter of splitOutsideQuotes(value, ";").slice(1)) {
    const match = /^\s*rel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,;]+))\s*$/i.exec(parameter);
    if (hasTermsOfServiceToken(match?.[1] ?? match?.[2] ?? match?.[3])) return true;
  }
  return false;
}

function hasTermsOfServiceHtmlRel(tag: string): boolean {
  const attribute = /\s([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of tag.matchAll(attribute)) {
    if (
      match[1]?.toLowerCase() === "rel" &&
      hasTermsOfServiceToken(match[2] ?? match[3] ?? match[4])
    ) {
      return true;
    }
  }
  return false;
}

export function termsOfServiceLinkHint(header: string | null): string | undefined {
  if (!header) return undefined;
  return splitOutsideQuotes(header, ",").some(hasTermsOfServiceLinkRel)
    ? `Link: ${header}`
    : undefined;
}

export function termsOfServiceHtmlHint(html: string): string | undefined {
  const match = /<link\b[^>]*>/gi;
  for (const tag of html.matchAll(match)) {
    if (hasTermsOfServiceHtmlRel(tag[0])) return `HTML: ${tag[0]}`;
  }
  return undefined;
}

export async function readBounded(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new Error(`Response exceeds the ${maxBytes}-byte limit`);
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error(`Response exceeds the ${maxBytes}-byte limit`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export async function fetchWithRedirects(
  input: string,
  options: {
    fetch?: FetchImplementation;
    signal: AbortSignal;
    maxBytes: number;
    maxRedirects: number;
    readBody?: boolean;
    authorize: (url: URL) => Promise<Authorization>;
    request?: <T>(url: URL, task: () => Promise<T>, signal: AbortSignal) => Promise<T>;
  },
): Promise<HttpResult> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const requestedUrl = parseWebUrl(input).href;
  let current = new URL(requestedUrl);

  for (let redirects = 0; ; redirects += 1) {
    options.signal.throwIfAborted();
    const authorization = await options.authorize(current);
    const hop = async () => {
      const response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        headers: {
          accept:
            "text/html,application/xhtml+xml,application/json,application/xml,text/plain;q=0.9,*/*;q=0.1",
        },
        signal: options.signal,
      });
      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location)
          throw new Error(`PEW-PEW: redirect ${response.status} did not include Location`);
        if (redirects >= options.maxRedirects) {
          throw new Error(`PEW-PEW: exceeded ${options.maxRedirects} redirects`);
        }
        return { response, location };
      }
      const refusal = REFUSAL_STATUSES.has(response.status) || response.status === 503;
      if (options.readBody === false || refusal) await response.body?.cancel();
      const body =
        options.readBody === false || refusal
          ? new Uint8Array()
          : await readBounded(response, options.maxBytes);
      return { response, body };
    };
    const result = options.request
      ? await options.request(current, hop, options.signal)
      : await hop();
    if ("location" in result && typeof result.location === "string") {
      current = parseWebUrl(new URL(result.location, current).href);
      continue;
    }
    return {
      requestedUrl,
      finalUrl: current.href,
      status: result.response.status,
      contentType: result.response.headers.get("content-type") ?? "",
      retryAfter: result.response.headers.get("retry-after") ?? undefined,
      body: result.body,
      authorization,
      termsOfService: termsOfServiceLinkHint(result.response.headers.get("link")),
    };
  }
}

export function decodeText(bytes: Uint8Array, contentType = ""): string {
  const charset = /charset\s*=\s*["']?([^;"'\s]+)/i.exec(contentType)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export function classifyTextContent(
  contentType: string,
): "html" | "json" | "xml" | "text" | undefined {
  const mime = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (mime === "text/html" || mime === "application/xhtml+xml") return "html";
  if (mime === "application/json" || mime.endsWith("+json")) return "json";
  if (mime === "application/xml" || mime === "text/xml" || mime.endsWith("+xml")) return "xml";
  if (mime.startsWith("text/") || mime === "application/javascript") return "text";
  return undefined;
}
