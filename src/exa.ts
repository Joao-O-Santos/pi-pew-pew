import { LIMITS } from "./constants.js";
import { type FetchImplementation, readBounded } from "./http.js";
import { WebFailureError } from "./types.js";

export const EXA_CONTENTS_URL = "https://api.exa.ai/contents";

export interface CachedPage {
  url: string;
  title?: string;
  text: string;
}

export class ExaCache {
  constructor(
    private readonly fetchImpl: FetchImplementation = globalThis.fetch,
    private readonly apiKey = process.env.EXA_API_KEY,
  ) {}

  async get(url: string, signal: AbortSignal): Promise<CachedPage> {
    if (!this.apiKey?.trim()) {
      throw new WebFailureError("PEW-PEW: EXA_API_KEY is required for mode=fetch", {
        source: "exa",
        reason: "EXA_API_KEY is not set",
      });
    }

    const response = await this.fetchImpl(EXA_CONTENTS_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        urls: [url],
        text: { maxCharacters: LIMITS.exaTextCharacters },
        maxAgeHours: -1,
      }),
      signal,
    });
    const retryAfter = response.headers.get("retry-after") ?? undefined;
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new WebFailureError(`PEW-PEW: Exa returned HTTP ${response.status}`, {
        source: "exa",
        status: response.status,
        retryAfter,
        reason: `Exa returned HTTP ${response.status}; no automatic retry was attempted`,
      });
    }
    const bytes = await readBounded(response, LIMITS.exaResponseBytes);

    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new WebFailureError("PEW-PEW: Exa returned invalid JSON", {
        source: "exa",
        status: response.status,
        reason: "Exa returned invalid JSON",
      });
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new WebFailureError("PEW-PEW: Exa returned a malformed response", {
        source: "exa",
        status: response.status,
        reason: "Exa response was not an object",
      });
    }
    const payload = value as { results?: unknown; statuses?: unknown };
    const status = Array.isArray(payload.statuses) ? payload.statuses[0] : undefined;
    if (!status || typeof status !== "object" || Array.isArray(status)) {
      throw new WebFailureError("PEW-PEW: Exa returned a malformed response", {
        source: "exa",
        status: response.status,
        reason: "Exa response did not include a per-URL status",
      });
    }
    const statusValue = (status as { status?: unknown }).status;
    if (statusValue === "error") {
      const tag =
        (status as { error?: { tag?: unknown } }).error &&
        typeof (status as { error?: { tag?: unknown } }).error?.tag === "string"
          ? (status as { error: { tag: string } }).error.tag
          : undefined;
      const cacheMiss = tag === "CRAWL_NOT_FOUND";
      throw new WebFailureError(
        cacheMiss
          ? "PEW-PEW: Exa has no cached copy of this URL"
          : "PEW-PEW: Exa could not return cached content for this URL",
        {
          source: "exa",
          status: response.status,
          reason: cacheMiss
            ? "Exa cache miss; mode=render can open the origin when appropriate"
            : "Exa could not return cached content; mode=render can open the origin when appropriate",
          suggestedMode: "render",
        },
      );
    }
    if (statusValue !== "success" || (status as { source?: unknown }).source === "crawled") {
      throw new WebFailureError("PEW-PEW: Exa returned a malformed response", {
        source: "exa",
        status: response.status,
        reason: "Exa did not confirm a cached result",
      });
    }
    const first = Array.isArray(payload.results) ? payload.results[0] : undefined;
    if (!first || typeof first !== "object" || Array.isArray(first)) {
      throw new WebFailureError("PEW-PEW: Exa returned a malformed response", {
        source: "exa",
        status: response.status,
        reason: "Exa confirmed success without a result",
      });
    }
    const item = first as Record<string, unknown>;
    if (typeof item.text !== "string" || !item.text.trim()) {
      throw new WebFailureError("PEW-PEW: Exa cached result contained no page text", {
        source: "exa",
        status: response.status,
        reason:
          "Exa cached result contained no page text; mode=render can open the origin when appropriate",
        suggestedMode: "render",
      });
    }
    return {
      url: typeof item.url === "string" && item.url ? item.url : url,
      ...(typeof item.title === "string" && item.title ? { title: item.title } : {}),
      text: item.text,
    };
  }
}
