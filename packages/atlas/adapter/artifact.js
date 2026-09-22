const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

// The artifact cannot record itself: its own hash would change every time it
// was written. Files under atlas/ stay out of the map the check compares.
function inAtlas(path) {
  return path === 'atlas' || path.startsWith('atlas/');
}

export function buildArtifact(mapped, commit) {
  return {
    boundaries: mapped.boundaries.map((boundary) => ({
      entryPoints: [...boundary.entryPoints].filter((path) => !inAtlas(path)).sort(),
      files: boundary.files
        .filter((file) => !inAtlas(file.path))
        .map((file) => ({ hash: file.hash, path: file.path }))
        .sort(byPath),
      globs: [...boundary.globs].sort(),
      importConfidence: boundary.importConfidence,
      name: boundary.name,
      role: boundary.role,
      status: boundary.status,
      unresolvedSites: boundary.unresolvedSites,
    })),
    edges: mapped.edges.map((edge) => ({ from: edge.from, kind: edge.kind, to: edge.to })),
    generatedFrom: { commit, tracked: mapped.generatedFrom.tracked },
    overlaps: mapped.overlaps
      .filter((overlap) => !inAtlas(overlap.path))
      .map((overlap) => ({
        boundaries: [...overlap.boundaries].sort(),
        hash: overlap.hash,
        path: overlap.path,
      }))
      .sort(byPath),
    submodules: [...mapped.submodules].sort(),
    symlinks: mapped.symlinks.filter((link) => !inAtlas(link.path)).map((link) => ({ path: link.path, target: link.target })).sort(byPath),
    unassigned: mapped.unassigned.filter((file) => !inAtlas(file.path)).map((file) => ({ hash: file.hash, path: file.path })).sort(byPath),
  };
}

export function serializeArtifact(artifact) {
  return `${JSON.stringify(sortKeys(artifact), null, 2)}\n`;
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}
