#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export const PANDOC_MINIMUM_VERSION = "3.10.1";
export const MARKDOWN_FILES = ["README.md"];

const PANDOC_ARGS = [
  "-f",
  "markdown",
  "-t",
  "markdown+pipe_tables-simple_tables-multiline_tables-grid_tables",
  "--wrap=auto",
  "--columns=72",
];

export function parsePandocVersion(value) {
  if (typeof value !== "string" || !/^\d+\.\d+(?:\.\d+)?$/.test(value)) return undefined;
  const parts = value.split(".").map(Number);
  return parts.length === 2 ? [...parts, 0] : parts;
}

export function comparePandocVersions(left, right) {
  const leftParts = parsePandocVersion(left);
  const rightParts = parsePandocVersion(right);
  if (!leftParts || !rightParts) throw new TypeError("Pandoc versions must be numeric.");
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function verifyPandoc() {
  const result = spawnSync("pandoc", ["--version"], { encoding: "utf8" });
  if (result.error?.code === "ENOENT") throw new Error("Pandoc is required for Markdown checks.");
  if (result.error || result.status !== 0) throw new Error("Unable to run pandoc --version.");
  const actual = result.stdout.match(/^pandoc\s+(\S+)/)?.[1];
  if (!parsePandocVersion(actual) || comparePandocVersions(actual, PANDOC_MINIMUM_VERSION) < 0) {
    throw new Error(
      `Pandoc ${PANDOC_MINIMUM_VERSION} or newer is required; found ${actual ?? "unknown"}.`,
    );
  }
}

export function formatMarkdown(path) {
  verifyPandoc();
  const result = spawnSync("pandoc", [...PANDOC_ARGS, path], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Pandoc failed for ${path}: ${result.stderr?.trim() || result.error?.message}`);
  }
  return result.stdout;
}

async function main() {
  const fix = process.argv.includes("--write");
  const changed = [];
  for (const path of MARKDOWN_FILES) {
    const before = await readFile(path, "utf8");
    const after = formatMarkdown(path);
    if (before === after) continue;
    changed.push(path);
    if (fix) {
      const temporary = join(dirname(path), `.${basename(path)}.tmp`);
      await writeFile(temporary, after);
      await rename(temporary, path);
    }
  }
  if (changed.length && !fix) {
    console.error(
      `Markdown differs from Pandoc formatting:\n${changed.join("\n")}\nRun npm run markdown:fix.`,
    );
    process.exitCode = 1;
  } else if (changed.length) {
    console.log(`Formatted Markdown:\n${changed.join("\n")}`);
  } else {
    console.log("Markdown matches Pandoc formatting.");
  }
}

if (process.argv[1] === import.meta.filename) await main();
