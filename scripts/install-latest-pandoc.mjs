#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const latestReleaseUrl = "https://api.github.com/repos/jgm/pandoc/releases/latest";

function selectLinuxAmd64Deb(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Pandoc release metadata is malformed.");
  }
  if (metadata.draft || metadata.prerelease || typeof metadata.tag_name !== "string") {
    throw new Error("Pandoc release metadata is not a stable release.");
  }
  const name = `pandoc-${metadata.tag_name}-1-amd64.deb`;
  const matches = Array.isArray(metadata.assets)
    ? metadata.assets.filter(
        (asset) =>
          asset &&
          typeof asset === "object" &&
          asset.name === name &&
          typeof asset.browser_download_url === "string",
      )
    : [];
  if (matches.length !== 1) throw new Error(`Could not find exactly one Pandoc asset ${name}.`);
  return matches[0].browser_download_url;
}

export async function installLatestPandoc({
  fetchImpl = fetch,
  writeFileImpl = writeFile,
  execFileSyncImpl = execFileSync,
  debPath = "/tmp/pandoc.deb",
} = {}) {
  const metadataResponse = await fetchImpl(latestReleaseUrl, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!metadataResponse.ok)
    throw new Error(`Pandoc metadata failed with HTTP ${metadataResponse.status}.`);
  const assetUrl = selectLinuxAmd64Deb(await metadataResponse.json());
  const downloadResponse = await fetchImpl(assetUrl);
  if (!downloadResponse.ok)
    throw new Error(`Pandoc download failed with HTTP ${downloadResponse.status}.`);
  await writeFileImpl(debPath, Buffer.from(await downloadResponse.arrayBuffer()));
  execFileSyncImpl("dpkg", ["--install", debPath], { stdio: "inherit" });
  return assetUrl;
}

if (process.argv[1] === import.meta.filename) await installLatestPandoc();
