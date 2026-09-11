export type WebMode = "fetch" | "render" | "screenshot";
export type WebOutcome = "ok" | "failed";
export type WebSource = "exa" | "chromium" | "local";

export interface WebDetails {
  outcome: WebOutcome;
  mode: WebMode;
  source?: WebSource;
  requestedUrl: string;
  finalUrl?: string;
  status?: number;
  contentType?: string;
  format?: "text" | "html" | "markdown" | "image";
  pandoc?: "converted" | "unavailable" | "failed";
  retryAfter?: string;
  reason?: string;
  truncated?: boolean;
  suggestedMode?: "render";
  capture?: { width: number; height: number; fullPage: boolean };
}

export interface WebResult {
  content: Array<
    { type: "text"; text: string } | { type: "image"; data: string; mimeType: string }
  >;
  details: WebDetails;
}

export class WebFailureError extends Error {
  constructor(
    message: string,
    readonly details: Partial<WebDetails> & { reason: string },
  ) {
    super(message);
    this.name = "WebFailureError";
  }
}
