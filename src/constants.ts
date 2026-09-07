export const USER_AGENT = "pi-pew-pew/0.1";
export const ROBOTS_AGENT = "pi-pew-pew";

export const LIMITS = {
  redirects: 5,
  httpBytes: 2 * 1024 * 1024,
  outputBytes: 50 * 1024,
  outputLines: 2_000,
  robotsBytes: 512 * 1024,
  llmsBytes: 64 * 1024,
  fetchTimeoutMs: 15_000,
  chromiumTimeoutMs: 30_000,
  chromiumBytes: 2 * 1024 * 1024,
  screenshotBytes: 10 * 1024 * 1024,
  processStderrBytes: 64 * 1024,
} as const;
