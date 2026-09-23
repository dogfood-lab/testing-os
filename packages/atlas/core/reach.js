/**
 * The boundaries a door reaches, in the order it reaches them.
 *
 * Depth 0 is the boundaries of the files the door runs. Each further depth is
 * one resolved import away, breadth first, so a boundary's depth is the
 * shortest import chain from the door to any of its files. An import that
 * resolves to a boundary rather than a file (a build chunk whose sources
 * share one) reaches that boundary but has no file to continue from.
 *
 * The walk also returns the files it visited, sorted: every tracked file the
 * door runs or imports. Landing places are read from these files, not from
 * the boundary names they add up to.
 *
 * @param {string[]} starts tracked paths the door runs
 * @param {{ files: Map<string, { imports?: unknown }>, boundaryOf: Map<string, string> }} graph
 */
export function walkReach(starts, graph) {
  const depthOf = new Map();
  const filesOf = new Map();
  const reached = (boundary, depth) => {
    if (!depthOf.has(boundary) || depthOf.get(boundary) > depth) depthOf.set(boundary, depth);
    if (!filesOf.has(boundary)) filesOf.set(boundary, new Set());
  };
  const visited = new Set();
  let frontier = [...new Set(starts)].filter((path) => graph.files.has(path)).sort();
  for (let depth = 0; frontier.length > 0; depth += 1) {
    const next = new Set();
    for (const path of frontier) visited.add(path);
    for (const path of frontier) {
      const boundary = graph.boundaryOf.get(path);
      if (boundary) {
        reached(boundary, depth);
        filesOf.get(boundary).add(path);
      }
      const imports = graph.files.get(path).imports;
      if (!Array.isArray(imports)) continue;
      for (const site of imports) {
        const resolved = site.resolved;
        if (resolved?.outcome === 'file' && graph.files.has(resolved.path) && !visited.has(resolved.path)) {
          next.add(resolved.path);
        } else if (resolved?.outcome === 'boundary') {
          reached(resolved.boundary, depth + 1);
        }
      }
    }
    frontier = [...next].sort();
  }
  const reach = [...depthOf.entries()]
    .map(([boundary, depth]) => ({ boundary, depth, files: filesOf.get(boundary).size }))
    .sort((a, b) => a.depth - b.depth || (a.boundary < b.boundary ? -1 : a.boundary > b.boundary ? 1 : 0));
  return { reach, files: [...visited].sort() };
}
