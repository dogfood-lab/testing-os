import { isTestFile } from './landings.js';
import { loadsManifest } from './languages.js';

/**
 * The boundaries a door reaches, in the order it reaches them.
 *
 * Depth 0 is the boundaries of the files the door runs. Each further depth is
 * one resolved import away, breadth first, so a boundary's depth is the
 * shortest import chain from the door to any of its files. An import that
 * resolves to a boundary rather than a file (a build chunk whose sources
 * share one) reaches that boundary but has no file to continue from.
 *
 * A start ending in a slash is a directory the door runs, and stands for the
 * code files under it: the files a directory run was recorded in place of.
 *
 * The walk also returns the files it visited, sorted: every tracked file the
 * door runs or imports. Landing places are read from these files, not from
 * the boundary names they add up to.
 *
 * A file a production file runs as a child process (python -m jobs) is
 * reached as an import is; a test's child processes are the runs it checks,
 * counted for what tests reach, not for the door.
 *
 * A boundary reached past depth 0 records `enters`: the first import into it,
 * as the file imported and the file importing it, in walk order (files by
 * path, each file's imports in source order). That is the file a reader
 * following the door opens first in that part, which its entry point may not be.
 *
 * @param {string[]} starts tracked paths the door runs, and directories it runs
 * @param {{ files: Map<string, { imports?: unknown, language?: string|null }>, boundaryOf: Map<string, string> }} graph
 */
export function walkReach(starts, graph) {
  const depthOf = new Map();
  const filesOf = new Map();
  const enters = new Map();
  const reached = (boundary, depth) => {
    if (!depthOf.has(boundary) || depthOf.get(boundary) > depth) depthOf.set(boundary, depth);
    if (!filesOf.has(boundary)) filesOf.set(boundary, new Set());
  };
  const visited = new Set();
  const expanded = new Set();
  const directories = starts.filter((path) => path.endsWith('/'));
  for (const path of starts) if (!path.endsWith('/')) expanded.add(path);
  if (directories.length > 0) {
    for (const [path, file] of graph.files) {
      if (file.language != null && directories.some((dir) => path.startsWith(dir))) expanded.add(path);
    }
  }
  let frontier = [...expanded].filter((path) => graph.files.has(path)).sort();
  for (let depth = 0; frontier.length > 0; depth += 1) {
    const next = new Set();
    for (const path of frontier) visited.add(path);
    for (const path of frontier) {
      const boundary = graph.boundaryOf.get(path);
      if (boundary) {
        reached(boundary, depth);
        filesOf.get(boundary).add(path);
      }
      if (!isTestFile(path)) {
        for (const target of graph.files.get(path).spawns ?? []) {
          if (!graph.files.has(target)) continue;
          const into = graph.boundaryOf.get(target);
          if (into && into !== boundary && !enters.has(into)) enters.set(into, { file: target, from: path });
          if (!visited.has(target)) next.add(target);
        }
      }
      const imports = graph.files.get(path).imports;
      if (!Array.isArray(imports)) continue;
      for (const site of imports) {
        const resolved = site.resolved;
        // A manifest a file loads is read, and reaches nothing (languages.js).
        if (resolved?.outcome === 'file' && graph.files.has(resolved.path) && !loadsManifest(site)) {
          const into = graph.boundaryOf.get(resolved.path);
          if (into && into !== boundary && !enters.has(into)) enters.set(into, { file: resolved.path, from: path });
          if (!visited.has(resolved.path)) next.add(resolved.path);
        } else if (resolved?.outcome === 'boundary') {
          reached(resolved.boundary, depth + 1);
        }
      }
    }
    frontier = [...next].sort();
  }
  const reach = [...depthOf.entries()]
    .map(([boundary, depth]) => {
      const entry = { boundary, depth, files: filesOf.get(boundary).size };
      if (depth > 0 && enters.has(boundary)) entry.enters = enters.get(boundary);
      return entry;
    })
    .sort((a, b) => a.depth - b.depth || (a.boundary < b.boundary ? -1 : a.boundary > b.boundary ? 1 : 0));
  return { reach, files: [...visited].sort() };
}
