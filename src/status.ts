export function httpStatusLabel(status: number | undefined): string {
  if (status === undefined) return "?";
  if (status >= 200 && status < 300) return "HIT";
  if (status >= 300 && status < 400) return "REDIR";

  switch (status) {
    case 401: return "AUTH";
    case 403: return "DENIED";
    case 404: return "MISS";
    case 407: return "PROXY";
    case 429: return "SLOW";
    case 451: return "BLOCKED";
    default:
      if (status >= 400 && status < 500) return "4XX";
      if (status >= 500 && status < 600) return "5XX";
      return `HTTP ${status}`;
  }
}

export function isSuccessfulHttpStatus(status: number | undefined): boolean {
  return status !== undefined && status >= 200 && status < 300;
}
