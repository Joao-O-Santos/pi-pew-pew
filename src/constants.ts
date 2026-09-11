export const LIMITS = {
  outputBytes: 50 * 1024,
  outputLines: 2_000,
  exaResponseBytes: 256 * 1024,
  fetchTimeoutMs: 15_000,
  pandocTimeoutMs: 10_000,
  chromiumTimeoutMs: 30_000,
  chromiumBytes: 2 * 1024 * 1024,
  localFileBytes: 256 * 1024 * 1024,
  screenshotBytes: 10 * 1024 * 1024,
  processStderrBytes: 64 * 1024,
} as const;
