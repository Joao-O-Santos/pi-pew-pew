export type WebMode = "fetch" | "render" | "screenshot";
export type WebOutcome = "ok" | "refused" | "failed";
export type RobotsState = "allowed" | "disallowed" | "absent" | "unavailable";
export type LlmsState = "found" | "absent" | "unavailable";

export interface RobotsResult {
  state: RobotsState;
  status?: number;
  retryAfter?: string;
  reason?: string;
}

export interface LlmsResult {
  state: LlmsState;
  text?: string;
  status?: number;
  retryAfter?: string;
  reason?: string;
}

export interface WebDetails {
  outcome: WebOutcome;
  mode: WebMode;
  source?: "http" | "local";
  requestedUrl: string;
  finalUrl?: string;
  status?: number;
  contentType?: string;
  format?: "text" | "html" | "markdown" | "json" | "xml" | "image";
  robots?: RobotsResult;
  llms?: Omit<LlmsResult, "text">;
  pandoc?: "converted" | "unavailable" | "failed";
  retryAfter?: string;
  reason?: string;
  truncated?: boolean;
  termsOfService?: string;
  suggestedMode?: "render";
  refusalScope?: "request" | "origin";
  retryPolicy?: "after-confirmed-state-change" | "after-retry-after" | "none";
  capture?: { width: number; height: number; fullPage: boolean };
}

export interface WebResult {
  content: Array<
    { type: "text"; text: string } | { type: "image"; data: string; mimeType: string }
  >;
  details: WebDetails;
}

export class RefusalError extends Error {
  constructor(
    message: string,
    readonly details: Partial<WebDetails> & { reason: string },
  ) {
    super(message);
    this.name = "RefusalError";
  }
}
