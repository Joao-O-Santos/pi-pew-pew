export function httpStatusLabel(status: number | undefined): string {
  if (status === undefined) return "UNKNOWN";
  if (status >= 200 && status < 300) return "HIT";
  if (status >= 300 && status < 400) return "REDIRECT";

  switch (status) {
    case 401: return "AUTH REQUIRED";
    case 403: return "FORBIDDEN";
    case 404: return "MISS";
    case 407: return "PROXY AUTH";
    case 429: return "RATE LIMITED";
    case 451: return "UNAVAILABLE";
    default:
      if (status >= 400 && status < 500) return "CLIENT ERROR";
      if (status >= 500 && status < 600) return "SERVER ERROR";
      return `HTTP ${status}`;
  }
}

export function isSuccessfulHttpStatus(status: number | undefined): boolean {
  return status !== undefined && status >= 200 && status < 300;
}
