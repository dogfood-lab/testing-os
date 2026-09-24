import { posix } from 'node:path';
import { cargoProject, crateRoots, RUST_STD } from './cargo.js';

/**
 * Rust's module tree, and each import site resolved through it, the way
 * rustc does: every crate root Cargo compiles (core/cargo.js crateRoots) is
 * the root module of its own crate, and each `mod name;` a file declares
 * loads name.rs or name/mod.rs from the directory the declaring file owns (a
 * crate root and a mod.rs own their directory, any other file the directory
 * named for it), or the file a #[path] attribute names, relative to the
 * declaring file's directory. A path in a use or in code resolves through
 * that tree to the deepest module it names: `use crate::a::b::Thing` is the
 * file of b when b is a module, of a when b is an item. A path starting with
 * a crate's name resolves through that crate's library when the crate is a
 * member of this repository, found by the `path =` of the dependency that
 * names it, or by the package itself for its own binaries, tests, examples
 * and benches; any other declared crate is a dependency, and one no manifest
 * declares is unresolved.
 *
 * Mutates each Rust file: fills `resolved` on its sites, drops the sites a
 * path in code named that are not a module here, sets `library` to the root
 * of its package's own library on a binary, test, example or bench that
 * uses it, and drops what the readings carried for this (`rust` on each
 * site, `rustModule`).
 *
 * @param {{ repoPath: string, tracked: Set<string>, files: object[] }} input
 */
export function resolveRust({ repoPath, tracked, files }) {
  const rust = files.filter((file) => file.language === 'rust' && Array.isArray(file.imports));
  if (rust.length === 0) return;
  const byPath = new Map(files.map((file) => [file.path, file]));
  const project = cargoProject(repoPath, tracked);
  const trees = [];
  const contexts = new Map();
  for (const root of crateRoots(project).sort((a, b) => compare(a.path, b.path))) {
    const tree = { key: `${root.kind}\0${root.path}`, crate: root.crate, kind: root.kind, modules: new Map() };
    trees.push(tree);
    const visited = new Set();
    const visit = (path, modulePath, owner) => {
      if (visited.has(path)) return;
      visited.add(path);
      if (!contexts.has(path)) contexts.set(path, []);
      contexts.get(path).push({ tree, modulePath });
      tree.modules.set(modulePath.join('::'), path);
      const file = byPath.get(path);
      if (!file || !Array.isArray(file.imports)) return;
      for (const scope of file.rustModule?.inline ?? []) tree.modules.set([...modulePath, ...scope].join('::'), path);
      for (const site of file.imports) {
        if (!site.rust?.mod) continue;
        const found = moduleFile(path, owner, site.rust, tracked);
        site.resolved ??= found ? { outcome: 'file', path: found.path } : { outcome: 'unresolved', reason: 'rust-module-not-found' };
        if (found) visit(found.path, [...modulePath, ...site.rust.scope, site.rust.mod], found.owner);
      }
    };
    visit(root.path, [], true);
  }
  const libOf = (crate) => trees.find((tree) => tree.crate === crate && tree.kind === 'lib') ?? null;
  const crateAt = new Map(project.crates.map((crate) => [crate.dir, crate]));

  for (const file of rust) {
    const context = contexts.get(file.path)?.[0] ?? null;
    const kept = [];
    for (const site of file.imports) {
      const info = site.rust;
      if (!info) {
        kept.push(site);
        continue;
      }
      if (info.mod) {
        // A file no crate root reaches still names its modules beside it.
        if (site.resolved == null) {
          const found = moduleFile(file.path, ownsDirectory(file.path), info, tracked);
          site.resolved = found ? { outcome: 'file', path: found.path } : { outcome: 'unresolved', reason: 'rust-module-not-found' };
        }
        kept.push(site);
        continue;
      }
      const through = {};
      const resolved = resolveUse(info, file, context, { libOf, crateAt }, through);
      // A path in code that names no module here is a type, a function in
      // scope or another crate's item, and was never an import to count.
      if (info.expression && (resolved.outcome !== 'file' || resolved.path === file.path)) continue;
      site.resolved = resolved;
      kept.push(site);
      // A binary, test or example that uses its own package's library goes
      // through that library's root, whichever module the path ends in.
      if (through.own && resolved.outcome === 'file') file.library = context.tree.crate.lib.path;
    }
    file.imports = kept;
  }
  for (const file of rust) {
    for (const site of file.imports) delete site.rust;
    delete file.rustModule;
  }
}

// A crate root and a file named mod.rs own the directory they are in; any
// other module file owns the directory named for it.
function ownsDirectory(path) {
  return posix.basename(path) === 'mod.rs';
}

/**
 * The file a `mod name;` loads, and whether that file owns its directory: a
 * #[path] file does, as rustc reads it.
 */
function moduleFile(path, owner, info, tracked) {
  const dir = posix.dirname(path) === '.' ? '' : posix.dirname(path);
  const own = owner ? dir : join(dir, posix.basename(path).replace(/\.rs$/, ''));
  if (info.path != null) {
    const base = info.scope.length === 0 ? dir : join(own, ...info.scope);
    const target = clean(join(base, info.path));
    return target != null && tracked.has(target) ? { path: target, owner: true } : null;
  }
  const base = join(own, ...info.scope);
  for (const [candidate, owns] of [[join(base, `${info.mod}.rs`), false], [join(base, info.mod, 'mod.rs'), true]]) {
    if (tracked.has(candidate)) return { path: candidate, owner: owns };
  }
  return null;
}

/**
 * A use path, or a path in code, resolved from the module the site is in.
 *
 * @returns {{ outcome: 'file', path: string } | { outcome: 'external' } | { outcome: 'unresolved', reason: string }}
 */
function resolveUse(info, file, context, { libOf, crateAt }, through = {}) {
  const segments = [...info.use];
  const here = context ? [...context.modulePath, ...info.scope] : null;
  let tree = context?.tree ?? null;
  let at;
  const first = segments.shift();
  const child = (base, name) => tree != null && tree.modules.has([...base, name].join('::'));
  if (first === '') {
    const found = externCrate(segments.shift(), tree, { libOf, crateAt });
    if (found.tree == null) return found.resolved;
    if (found.own) through.own = true;
    tree = found.tree;
    at = [];
  } else if (first === 'crate') {
    if (tree == null) return { outcome: 'unresolved', reason: 'rust-crate-not-found' };
    at = [];
  } else if (first === 'self' || first === 'super') {
    if (tree == null) return { outcome: 'unresolved', reason: 'rust-crate-not-found' };
    at = [...here];
    if (first === 'super') at.pop();
    while (segments[0] === 'super') {
      segments.shift();
      at.pop();
    }
  } else if (here != null && child(here, first)) {
    at = [...here, first];
  } else if (RUST_STD.has(first)) {
    return { outcome: 'external' };
  } else {
    const found = externCrate(first, tree, { libOf, crateAt });
    if (found.tree != null) {
      if (found.own) through.own = true;
      tree = found.tree;
      at = [];
    } else if (found.resolved.outcome !== 'unresolved' || info.crate) {
      return found.resolved;
    } else if ((file.rustModule?.names ?? []).includes(first)) {
      // An item or an alias of this file: use Direction::*, or a name an
      // earlier use brought in.
      return { outcome: 'file', path: file.path };
    } else return found.resolved;
  }
  for (const segment of segments) {
    if (segment === 'self') continue;
    if (segment === 'super') {
      at.pop();
      continue;
    }
    if (!child(at, segment)) break;
    at.push(segment);
  }
  const path = tree.modules.get(at.join('::'));
  return path ? { outcome: 'file', path } : { outcome: 'unresolved', reason: 'rust-module-not-found' };
}

// A crate named at the start of a path: a member of this repository, which
// is followed into its library; a dependency from elsewhere; or none.
function externCrate(name, tree, { libOf, crateAt }) {
  const unresolved = { tree: null, resolved: { outcome: 'unresolved', reason: 'undeclared-crate' } };
  if (name == null) return unresolved;
  if (RUST_STD.has(name)) return { tree: null, resolved: { outcome: 'external' } };
  if (tree == null) return { tree: null, resolved: { outcome: 'unresolved', reason: 'rust-crate-not-found' } };
  const crate = tree.crate;
  if (tree.kind !== 'lib' && crate.lib?.name === name) {
    const lib = libOf(crate);
    return lib ? { tree: lib, resolved: null, own: true } : unresolved;
  }
  const dep = crate.deps.get(name);
  if (!dep) return unresolved;
  if (dep.path == null) return { tree: null, resolved: { outcome: 'external' } };
  const member = crateAt.get(dep.path);
  const lib = member ? libOf(member) : null;
  return lib ? { tree: lib, resolved: null } : { tree: null, resolved: { outcome: 'unresolved', reason: 'local-crate-not-found' } };
}

function join(...parts) {
  return parts.filter((part) => part !== '').join('/');
}

function clean(path) {
  const normalized = posix.normalize(path);
  return normalized === '..' || normalized.startsWith('../') || normalized.startsWith('/') ? null : normalized;
}

function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
