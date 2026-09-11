export type FetchImplementation = typeof globalThis.fetch;

export function parseWebUrl(input: string, options: { allowFile?: boolean } = {}): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`PEW-PEW: malformed URL: ${input}`);
  }
  const remote = url.protocol === "http:" || url.protocol === "https:";
  const localFile = options.allowFile && url.protocol === "file:";
  if (!remote && !localFile) {
    throw new Error(
      `PEW-PEW: unsupported URL protocol ${url.protocol || "(none)"}; use HTTP or HTTPS${options.allowFile ? " or a local file for screenshots" : ""}`,
    );
  }
  if (!localFile) url.hash = "";
  return url;
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
