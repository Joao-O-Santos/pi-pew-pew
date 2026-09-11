import robotsParserModule from "robots-parser";
import { DISALLOWED_TARGET_LIMIT, LIMITS, REDIRECT_STATUSES } from "./constants.js";
import {
  type Authorization,
  decodeText,
  type FetchImplementation,
  parseWebUrl,
  readBounded,
} from "./http.js";
import { type LlmsResult, RefusalError, type RobotsResult } from "./types.js";

interface Robot {
  isAllowed(url: string, ua?: string): boolean | undefined;
}
const robotsParser = robotsParserModule as unknown as (url: string, text: string) => Robot;

interface RobotsSource {
  result: RobotsResult;
  parser?: Robot;
  cacheable: boolean;
}
interface LlmsSource {
  result: LlmsResult;
  cacheable: boolean;
}

async function fromCache<T extends { cacheable: boolean }, R>(
  cache: Map<string, Promise<T>>,
  key: string,
  load: () => Promise<T>,
  clone: (source: T) => R,
): Promise<R> {
  let pending = cache.get(key);
  if (!pending) {
    pending = load();
    cache.set(key, pending);
  }
  try {
    const source = await pending;
    if (!source.cacheable && cache.get(key) === pending) cache.delete(key);
    return clone(source);
  } catch (error) {
    if (cache.get(key) === pending) cache.delete(key);
    throw error;
  }
}

type RequestRunner = <T>(url: URL, task: () => Promise<T>, signal: AbortSignal) => Promise<T>;
type DeferOrigin = (origin: string, milliseconds: number) => void;

async function fetchPolicyFile(
  initial: URL,
  maxBytes: number,
  fetchImpl: FetchImplementation,
  signal: AbortSignal,
  request?: RequestRunner,
  defer?: DeferOrigin,
): Promise<{ status: number; body: Uint8Array; contentType: string; retryAfter?: string }> {
  let current = initial;
  for (let redirects = 0; ; redirects += 1) {
    const load = async () => {
      const response = await fetchImpl(current, {
        redirect: "manual",
        headers: { accept: "text/plain,*/*;q=0.1" },
        signal,
      });
      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location || redirects >= LIMITS.redirects)
          throw new Error("policy file redirect limit exceeded");
        const next = parseWebUrl(new URL(location, current).href);
        if (next.origin !== initial.origin) throw new Error("policy file redirect changed origin");
        current = next;
        return undefined;
      }
      const retryAfter = response.headers.get("retry-after") ?? undefined;
      const body = await readBounded(response, maxBytes);
      if (response.status === 429 && retryAfter && defer) {
        const seconds = Number(retryAfter);
        const timestamp = Date.parse(retryAfter);
        const delay =
          Number.isFinite(seconds) && seconds > 0
            ? Math.ceil(seconds * 1_000)
            : Number.isNaN(timestamp)
              ? undefined
              : timestamp - Date.now();
        if (delay !== undefined && delay > 0) defer(current.origin, delay);
      }
      return {
        status: response.status,
        body,
        contentType: response.headers.get("content-type") ?? "",
        retryAfter,
      };
    };
    const result = request ? await request(current, load, signal) : await load();
    if (!result) continue;
    return result;
  }
}

export class PolicyManager {
  private readonly robotsCache = new Map<string, Promise<RobotsSource>>();
  private readonly llmsCache = new Map<string, Promise<LlmsSource>>();
  private readonly disallowedTargetRequests = new Map<string, number>();

  constructor(
    private readonly fetchImpl: FetchImplementation = globalThis.fetch,
    private readonly request?: RequestRunner,
    private readonly defer?: DeferOrigin,
  ) {}

  private async loadRobots(origin: string, signal: AbortSignal): Promise<RobotsSource> {
    const robotsUrl = new URL("/robots.txt", origin);
    try {
      const response = await fetchPolicyFile(
        robotsUrl,
        LIMITS.robotsBytes,
        this.fetchImpl,
        signal,
        this.request,
        this.defer,
      );
      if (response.status >= 200 && response.status < 300) {
        return {
          result: { state: "allowed", status: response.status },
          parser: robotsParser(robotsUrl.href, decodeText(response.body, response.contentType)),
          cacheable: true,
        };
      }
      if (response.status === 401 || response.status === 403) {
        return {
          result: {
            state: "unavailable",
            status: response.status,
            reason: "robots.txt denied access",
          },
          cacheable: false,
        };
      }
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return { result: { state: "absent", status: response.status }, cacheable: true };
      }
      return {
        result: {
          state: "unavailable",
          status: response.status,
          retryAfter: response.retryAfter,
          reason: `robots.txt returned HTTP ${response.status}`,
        },
        cacheable: false,
      };
    } catch (error) {
      if (signal.aborted) throw error;
      return {
        result: {
          state: "unavailable",
          reason: `robots.txt could not be checked: ${error instanceof Error ? error.message : String(error)}`,
        },
        cacheable: false,
      };
    }
  }

  async robotsFor(url: URL, signal: AbortSignal): Promise<RobotsResult> {
    return fromCache(
      this.robotsCache,
      url.origin,
      () => this.loadRobots(url.origin, signal),
      (source) => {
        if (!source.parser) return { ...source.result };
        const allowed = source.parser.isAllowed(url.href, "*") !== false;
        return allowed
          ? { ...source.result, state: "allowed" }
          : {
              state: "disallowed",
              status: source.result.status,
              reason: "robots.txt disallows this URL",
            };
      },
    );
  }

  private async loadLlms(origin: string, signal: AbortSignal): Promise<LlmsSource> {
    try {
      const response = await fetchPolicyFile(
        new URL("/llms.txt", origin),
        LIMITS.llmsBytes,
        this.fetchImpl,
        signal,
        this.request,
        this.defer,
      );
      if (response.status >= 200 && response.status < 300) {
        return {
          result: {
            state: "found",
            status: response.status,
            text: decodeText(response.body, response.contentType),
          },
          cacheable: true,
        };
      }
      if (response.status === 404 || response.status === 410) {
        return { result: { state: "absent", status: response.status }, cacheable: true };
      }
      return {
        result: {
          state: "unavailable",
          status: response.status,
          retryAfter: response.retryAfter,
          reason: `llms.txt returned HTTP ${response.status}`,
        },
        cacheable: false,
      };
    } catch (error) {
      if (signal.aborted) throw error;
      return {
        result: {
          state: "unavailable",
          reason: `llms.txt could not be retrieved: ${error instanceof Error ? error.message : String(error)}`,
        },
        cacheable: false,
      };
    }
  }

  async llmsFor(origin: string, signal: AbortSignal): Promise<LlmsResult> {
    return fromCache(
      this.llmsCache,
      origin,
      () => this.loadLlms(origin, signal),
      (source) => ({ ...source.result }),
    );
  }

  private allowDisallowedTarget(origin: string): boolean {
    const requests = this.disallowedTargetRequests.get(origin) ?? 0;
    if (requests >= DISALLOWED_TARGET_LIMIT) return false;
    this.disallowedTargetRequests.set(origin, requests + 1);
    return true;
  }

  async authorize(url: URL, signal: AbortSignal): Promise<Authorization> {
    const robots = await this.robotsFor(url, signal);
    if (robots.state === "disallowed" && !this.allowDisallowedTarget(url.origin)) {
      throw new RefusalError(`PEW-PEW: robots.txt disallows further requests to ${url.origin}`, {
        reason: `robots.txt disallows more than ${DISALLOWED_TARGET_LIMIT} target requests per origin`,
        robots,
        refusalScope: "origin",
        retryPolicy: "none",
      });
    }
    const llms = await this.llmsFor(url.origin, signal);
    return { robots, llms };
  }
}
