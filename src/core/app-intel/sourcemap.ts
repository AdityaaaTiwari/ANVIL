import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** Source map summary and safe extraction of embedded original sources. */

export interface SourceMapInfo {
  file?: string | undefined;
  sources: number;
  withContent: number;
  firstParty: number;
  thirdParty: number;
  /** Top-level folders of first-party sources, e.g. "src", "app". */
  roots: string[];
}

interface RawSourceMap {
  version?: number;
  file?: string;
  sources?: unknown[];
  sourcesContent?: unknown[];
  mappings?: unknown;
}

export function looksLikeSourceMap(text: string): boolean {
  return /^\s*\{/.test(text) && /"mappings"\s*:/.test(text) && /"sources"\s*:/.test(text);
}

export function parseSourceMap(text: string): RawSourceMap {
  const map = JSON.parse(text) as RawSourceMap;
  if (!Array.isArray(map.sources) || typeof map.mappings !== "string") throw new Error("Not a source map");
  return map;
}

/** Turns "webpack://app/./src/a.ts" or "../../src/a.ts" into a safe relative path ("app/src/a.ts"). */
export function normalizeSourcePath(source: string): string {
  const withoutScheme = source.replace(/^[a-z][a-z0-9+.-]*:\/\/+/i, "").replace(/[?#].*$/, "");
  const parts = withoutScheme
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== ".." && !/^[a-z]:$/i.test(part))
    .map((part) => part.replace(/[<>:"|?*\u0000-\u001f]/g, "_"));
  return parts.join("/") || "unnamed-source";
}

export function summarizeSourceMap(map: RawSourceMap): SourceMapInfo {
  const sources = (map.sources ?? []).map((source) => normalizeSourcePath(String(source ?? "")));
  const contents = map.sourcesContent ?? [];
  const thirdParty = sources.filter((source) => /(^|\/)node_modules\//.test(source)).length;
  const roots = new Map<string, number>();
  for (const source of sources) {
    if (/(^|\/)node_modules\//.test(source)) continue;
    const root = source.split("/")[0] ?? "";
    roots.set(root, (roots.get(root) ?? 0) + 1);
  }
  return {
    file: typeof map.file === "string" ? map.file : undefined,
    sources: sources.length,
    withContent: contents.filter((content) => typeof content === "string" && content.length > 0).length,
    firstParty: sources.length - thirdParty,
    thirdParty,
    roots: [...roots.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([root]) => root),
  };
}

/**
 * Writes every embedded original source under `outDir`, never outside it.
 * Returns the number of files written.
 */
export async function extractSources(
  map: RawSourceMap,
  outDir: string,
  options: { includeThirdParty?: boolean | undefined; maxFiles?: number } = {}
): Promise<number> {
  const root = path.resolve(outDir);
  const contents = map.sourcesContent ?? [];
  const used = new Set<string>();
  let written = 0;
  for (const [index, source] of (map.sources ?? []).entries()) {
    const content = contents[index];
    if (typeof content !== "string" || !content) continue;
    let relative = normalizeSourcePath(String(source ?? ""));
    if (!options.includeThirdParty && /(^|\/)node_modules\//.test(relative)) continue;
    if (written >= (options.maxFiles ?? 10_000)) break;
    const base = relative;
    for (let n = 2; used.has(relative); n += 1) relative = base.replace(/(\.[^./]+)?$/, `.${n}$1`);
    used.add(relative);
    const target = path.resolve(root, relative);
    if (target !== root && !target.startsWith(root + path.sep)) continue;
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
    written += 1;
  }
  return written;
}
