const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

// The artifact describes the tree minus atlas/. Every list below, and every
// count, is over that set. The directory cannot record a stable hash of
// itself, and a count that includes it changes on the commit that lands it.
function inAtlas(path) {
  return path === 'atlas' || path.startsWith('atlas/');
}

function keep(items) {
  return items.filter((item) => !inAtlas(item.path));
}

function siteCounts(files) {
  let unresolved = 0;
  let resolved = 0;
  for (const file of files) {
    if (!Array.isArray(file.imports)) continue;
    for (const site of file.imports) {
      const outcome = site.resolved?.outcome;
      if (outcome === 'file' || outcome === 'boundary' || outcome === 'external') resolved += 1;
      else unresolved += 1;
    }
  }
  return { unresolved, resolved };
}

export function buildArtifact(mapped, commit) {
  const boundaries = mapped.boundaries.map((boundary) => {
    const files = keep(boundary.files);
    const sites = siteCounts(files);
    return {
      entryPoints: [...boundary.entryPoints].filter((path) => !inAtlas(path)).sort(),
      files: files.map((file) => ({ hash: file.hash, path: file.path })).sort(byPath),
      globs: [...boundary.globs].sort(),
      importConfidence: sites.unresolved > sites.resolved ? 'low' : 'full',
      name: boundary.name,
      role: boundary.role,
      status: boundary.status,
      unresolvedSites: sites.unresolved,
    };
  });
  const overlaps = keep(mapped.overlaps)
    .map((overlap) => ({
      boundaries: [...overlap.boundaries].sort(),
      hash: overlap.hash,
      path: overlap.path,
    }))
    .sort(byPath);
  const unassigned = keep(mapped.unassigned).map((file) => ({ hash: file.hash, path: file.path })).sort(byPath);
  const tracked = boundaries.reduce((sum, boundary) => sum + boundary.files.length, 0) + overlaps.length + unassigned.length;
  return {
    boundaries,
    edges: mapped.edges.map((edge) => ({ from: edge.from, kind: edge.kind, to: edge.to })),
    generatedFrom: { commit, tracked },
    overlaps,
    submodules: [...mapped.submodules].sort(),
    symlinks: mapped.symlinks.filter((link) => !inAtlas(link.path)).map((link) => ({ path: link.path, target: link.target })).sort(byPath),
    unassigned,
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
