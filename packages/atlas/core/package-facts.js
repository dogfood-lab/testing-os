import semver from 'semver';
import { parse as parseYaml } from 'yaml';
import { isNodeBuiltin } from './builtins.js';
import { lockFor, packageByName } from './lockfile.js';

/**
 * What a repository's npm packages are, for the map's package facts
 * (docs/atlas-buildup.spec.md, slice AO): a package's identity as a purl,
 * the kind of a declared dependency, and the version a lockfile resolves it
 * to. Every version is read from a tracked lockfile, never from what is
 * installed, so a clean clone, an installed tree and a built one give the
 * same map. A version no lockfile here can give is null, with the reason.
 */

/**
 * A package's purl, in the Package-URL form (ECMA-427): pkg:npm/name, or
 * pkg:npm/%40scope/name for a scoped one. The version is never part of it;
 * the declared range and the resolved version are facts of their own.
 *
 * @param {string} name an npm package name
 */
export function npmPurl(name) {
  const at = name.startsWith('@') ? name.indexOf('/') : -1;
  if (at > 0) return `pkg:npm/${encodeURIComponent(name.slice(0, at))}/${encodeURIComponent(name.slice(at + 1))}`;
  return `pkg:npm/${encodeURIComponent(name)}`;
}

/**
 * A dependency as package.json declares it, with the package it names and
 * its kind:
 * - workspace (workspace:), file (file:) and link (link:, portal:), each of
 *   which moves with the tree;
 * - git (a git URL or a host shorthand such as user/repo or github:) and url
 *   (a tarball over HTTP), which name no registry package;
 * - registry, for a range, a tag or an alias. An alias (npm:real@range) is
 *   installed under its own name but is the package it names, so its purl
 *   and range are the real package's, and the alias is kept beside them.
 *
 * @param {string} name the key package.json declares it under
 * @param {string} range the spec it declares
 * @returns {{ name: string, purl: string, range: string, kind: string, alias?: string }}
 */
export function declaredDependency(name, range) {
  const spec = String(range).trim();
  const of = (kind) => ({ name, purl: npmPurl(name), range: spec, kind });
  if (spec.startsWith('workspace:')) return of('workspace');
  if (spec.startsWith('file:')) return of('file');
  if (spec.startsWith('link:') || spec.startsWith('portal:')) return of('link');
  const alias = /^npm:((?:@[^/@]+\/)?[^@]+)(?:@(.*))?$/.exec(spec);
  if (alias) return { name: alias[1], purl: npmPurl(alias[1]), range: alias[2] ?? '', kind: 'registry', alias: name };
  if (/^(git\+|git:|github:|gitlab:|bitbucket:|gist:)/.test(spec) || /^[^@./\s][^/\s]*\/[^/\s]+(#.*)?$/.test(spec)) return of('git');
  if (/^https?:/.test(spec)) return of('url');
  return of('registry');
}

const PNPM_LOCK = 'pnpm-lock.yaml';
const NPM_LOCK = 'package-lock.json';
// Lockfiles a version is not read from, named so the reason can say which.
const UNREAD_LOCKS = ['yarn.lock', 'bun.lock', 'bun.lockb'];
const PNPM_READ = new WeakMap();

/**
 * A pnpm-lock.yaml, for the version each importer resolves a dependency to.
 * lockfileVersion 6 and 9 list each importer's dependencies with the spec
 * and the version, the version carrying any peer suffix in parentheses; a
 * lock of version 6 for a single project lists them at the top instead.
 * Any other version, or a file that does not parse, is unresolved, with why.
 *
 * @param {string} text the lock as git stores it
 * @returns {{ ok: true, version: string, importers: Map<string, Map<string, { specifier: string|null, version: string }>> }
 *   | { ok: false, unresolved: string }}
 */
export function readPnpmLock(text) {
  let doc;
  try {
    doc = parseYaml(text);
  } catch {
    return { ok: false, unresolved: 'does not parse' };
  }
  if (!isMapping(doc)) return { ok: false, unresolved: 'does not parse' };
  const version = String(doc.lockfileVersion ?? 'missing');
  if (!/^(6|9)(\.\d+)?$/.test(version)) return { ok: false, unresolved: `lockfileVersion ${version}` };
  const sections = isMapping(doc.importers) ? doc.importers : { '.': doc };
  const importers = new Map();
  for (const [path, importer] of Object.entries(sections)) {
    if (!isMapping(importer)) continue;
    const deps = new Map();
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      if (!isMapping(importer[field])) continue;
      for (const [name, entry] of Object.entries(importer[field])) {
        const resolved = isMapping(entry) ? entry.version : entry;
        if (resolved != null) deps.set(name, { specifier: isMapping(entry) ? entry.specifier ?? null : null, version: String(resolved) });
      }
    }
    importers.set(path === '' ? '.' : path, deps);
  }
  return { ok: true, version, importers };
}

/**
 * What a lockfile records of a declared dependency of one manifest: from
 * the nearest tracked package-lock.json or pnpm-lock.yaml at or above the
 * manifest's directory, under the name it is installed as (an alias's own).
 * - A registry package: the version the lock installs.
 * - A git dependency: the commit the lock pins, 40 hex, and the name of the
 *   package that commit holds when it is not the name it is installed as
 *   (github:o/vocal-synth-engine can install @scope/vocal-synth-engine).
 * - A workspace, file or link dependency, or a tarball URL: none, since it
 *   is the tree itself or names no version.
 * Null, with the reason, when no lock here says, the nearest is one Atlas
 * does not read, or what it pins is not a version (or, for git, a commit).
 *
 * @param {{ tracked: Set<string>, text: (path: string) => string|null }} repo
 * @param {string} dir the manifest's directory, '' for the root
 * @param {ReturnType<typeof declaredDependency>} dependency
 * A name the lock links to a member's directory (npm workspaces declare a
 * sibling with a plain range, ^1.0.0, and install it from the tree) is said
 * to be linked, since the range alone would read as a registry package.
 *
 * @returns {{ version: string, from: string, realName?: string } | { version: null, unknown: string, linked?: true }}
 */
export function resolvedVersion(repo, dir, dependency) {
  const { kind } = dependency;
  const name = dependency.alias ?? dependency.name;
  if (kind === 'workspace' || kind === 'file' || kind === 'link') return { version: null, unknown: `a ${kind} dependency moves with the tree` };
  if (kind === 'url') return { version: null, unknown: 'a tarball URL names no version' };
  const lock = nearestLock(repo, dir);
  if (!lock) return { version: null, unknown: 'no lockfile' };
  if (lock.unread) return { version: null, unknown: `${lock.path} is not read` };
  if (lock.kind === 'npm') {
    const found = lockFor(repo, dir);
    if (!found.lock.ok) return { version: null, unknown: `${found.path}: ${found.lock.unresolved}` };
    // A lock installs its own directory and the workspace members it lists
    // by their directory; a manifest below it that is neither, such as a
    // fixture, is installed by nothing it records.
    if (found.within !== '' && !found.lock.packages.has(found.within)) return { version: null, unknown: `${found.path} does not install ${dir}` };
    const entry = packageByName(found.lock, found.within, name);
    if (!entry) return { version: null, unknown: `${found.path} holds no ${name} for ${dir || 'the root'}` };
    if (!entry.key.split('/').includes('node_modules')) return { version: null, unknown: `${found.path} links ${name} from ${entry.key}`, linked: true };
    if (kind === 'git') {
      const resolved = found.lock.packages.get(entry.key)?.resolved;
      return commitOf(typeof resolved === 'string' ? resolved : '', found.path, entry.name !== name ? entry.name : null);
    }
    if (entry.version == null) return { version: null, unknown: `${found.path} holds no version of ${name} for ${dir || 'the root'}` };
    return versionOf(entry.version, found.path);
  }
  const read = pnpmLock(repo, lock.path);
  if (!read.ok) return { version: null, unknown: `${lock.path}: ${read.unresolved}` };
  const importer = lock.dir === dir ? '.' : dir.slice(lock.dir === '' ? 0 : lock.dir.length + 1);
  if (!read.importers.has(importer)) return { version: null, unknown: `${lock.path} does not install ${dir}` };
  const entry = read.importers.get(importer).get(name);
  if (!entry) return { version: null, unknown: `${lock.path} holds no ${name} for ${dir || 'the root'}` };
  if (kind === 'git') {
    // @scope/real@https://codeload.github.com/o/r/tar.gz/<commit>: the
    // package the commit holds, then where pnpm fetched it from.
    const real = /^((?:@[^/@]+\/)?[^@]+)@(?:https?:|git\+|git:|github:|ssh:)/.exec(entry.version)?.[1] ?? null;
    return commitOf(entry.version, lock.path, real != null && real !== name ? real : null);
  }
  // 18.3.1(react@18.3.1): the peer suffix records what it was resolved with.
  // An alias's entry names the real package first: real@1.2.3.
  const version = entry.version.replace(/\(.*$/, '').replace(/^(?:@[^/@]+\/)?[^@]+@(?=\d)/, '');
  if (version.startsWith('link:') || version.startsWith('file:')) return { version: null, unknown: `${lock.path} links ${name} from the tree`, linked: true };
  return versionOf(version, lock.path);
}

function versionOf(version, from) {
  if (semver.valid(version)) return { version, from };
  return { version: null, unknown: `${from} pins ${shown(version)}, not a version` };
}

// The commit a lock pins a git dependency to: the last 40-hex run in what it
// records (npm's resolved ...#<commit>, pnpm's .../tar.gz/<commit>).
function commitOf(pinned, from, realName) {
  const commits = pinned.match(/[0-9a-f]{40}(?![0-9a-f])/g);
  if (!commits) return { version: null, unknown: `${from} pins ${pinned === '' ? 'no commit' : shown(pinned)}, not a commit` };
  return { version: commits[commits.length - 1], from, ...(realName ? { realName } : {}) };
}

function shown(text) {
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

/**
 * A git repository as one URL, so a dependency on it and the repository a
 * package says it is from can be compared: https://host/owner/repo. The
 * host shorthands (github:, gitlab:, bitbucket:, a bare owner/repo), git+,
 * ssh:// and git@host:owner/repo forms all come to it, with no .git and no
 * #ref. Anything else is kept as written, less a git+ prefix and a #ref.
 *
 * @param {string} spec a dependency's git spec, or a manifest's repository
 */
export function gitRepositoryUrl(spec) {
  let text = String(spec).trim().replace(/^git\+/, '').replace(/#.*$/, '');
  const host = /^(github|gitlab|bitbucket):(.+)$/.exec(text);
  if (host) text = `https://${{ github: 'github.com', gitlab: 'gitlab.com', bitbucket: 'bitbucket.org' }[host[1]]}/${host[2]}`;
  else if (/^gist:/.test(text)) text = `https://gist.github.com/${text.slice('gist:'.length)}`;
  else if (/^[^@./:\s][^/:\s]*\/[^/:\s]+$/.test(text)) text = `https://github.com/${text}`;
  else {
    const scp = /^(?:[^@/\s]+@)?([^/:\s]+):(?!\/\/)(.+)$/.exec(text);
    const url = /^(?:ssh|git|https?):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/.exec(text);
    if (url) text = `https://${url[1]}/${url[2]}`;
    else if (scp) text = `https://${scp[1]}/${scp[2]}`;
  }
  return text.replace(/\.git$/, '').replace(/\/+$/, '');
}

// The nearest lockfile at or above a directory: the first directory up that
// holds any lockfile decides. There, npm installs from npm-shrinkwrap.json
// before package-lock.json, and the shrinkwrap is not read, so it makes the
// version unknown rather than letting the lock npm passes over answer.
function nearestLock(repo, dir) {
  let at = dir;
  for (;;) {
    const named = (file) => (at === '' ? file : `${at}/${file}`);
    if (repo.tracked.has(named('npm-shrinkwrap.json'))) return { unread: true, path: named('npm-shrinkwrap.json'), dir: at };
    if (repo.tracked.has(named(NPM_LOCK))) return { kind: 'npm', path: named(NPM_LOCK), dir: at };
    if (repo.tracked.has(named(PNPM_LOCK))) return { kind: 'pnpm', path: named(PNPM_LOCK), dir: at };
    const other = UNREAD_LOCKS.find((file) => repo.tracked.has(named(file)));
    if (other) return { unread: true, path: named(other), dir: at };
    if (at === '') return null;
    at = at.includes('/') ? at.slice(0, at.lastIndexOf('/')) : '';
  }
}

function pnpmLock(repo, path) {
  if (!PNPM_READ.has(repo)) PNPM_READ.set(repo, new Map());
  const read = PNPM_READ.get(repo);
  if (!read.has(path)) {
    const text = repo.text(path);
    read.set(path, text == null ? { ok: false, unresolved: 'unreadable' } : readPnpmLock(text));
  }
  return read.get(path);
}

const FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

/**
 * The map's package facts (docs/atlas-buildup.spec.md, slice AO), facts of
 * this repository alone; what other repositories make of them is joined
 * when a question is asked, never here.
 * - manifests: every tracked package.json, with one role by precedence
 *   (root, then member of the workspace, then installed by a door's step,
 *   then other: fixtures, examples, templates), how the role was known, and
 *   its name, version and private flag as it states them.
 * - dependencies: every declaration in every manifest, with its purl, range,
 *   kind and what the lockfile records of it.
 * - published: each non-private manifest a door publishes to npm, with its
 *   version and the repository it names.
 * - imports: for each JavaScript or TypeScript file, the packages its bare
 *   imports name, each with the manifest whose declaration covers it.
 *
 * @param {{ view: object, doors: object[], files: object[] }} input
 *   view: the repository view (core/commands.js repositoryView)
 * @returns {{ manifests: object[], dependencies: object[], published: object[], imports: Map<string, object[]> }}
 */
export function packageFacts({ view, doors, files }) {
  const paths = [...view.tracked].filter((path) => path === 'package.json' || path.endsWith('/package.json')).sort();
  const dirOf = (path) => (path === 'package.json' ? '' : path.slice(0, -'/package.json'.length));
  const members = view.workspaces();
  const memberFrom = workspaceSource(view);
  const installedFrom = installRoles(doors);
  const manifests = [];
  const dependencies = [];
  for (const path of paths) {
    const dir = dirOf(path);
    const pkg = view.manifest(dir);
    let role = 'other';
    let roleFrom = 'no workspace lists it and no install step Atlas reads runs in its directory';
    if (path === 'package.json') [role, roleFrom] = ['root', 'the root manifest'];
    else if (members.has(dir)) [role, roleFrom] = ['member', memberFrom];
    else if (installedFrom.has(dir)) [role, roleFrom] = ['installed', installedFrom.get(dir)];
    manifests.push({
      path,
      role,
      roleFrom,
      ...(typeof pkg?.name === 'string' ? { name: pkg.name } : {}),
      ...(typeof pkg?.version === 'string' ? { version: pkg.version } : {}),
      ...(pkg?.private === true ? { private: true } : {}),
      ...(pkg == null || typeof pkg !== 'object' || Array.isArray(pkg) ? { unreadable: true } : {}),
    });
    if (!isMapping(pkg)) continue;
    for (const field of FIELDS) {
      if (!isMapping(pkg[field])) continue;
      for (const key of Object.keys(pkg[field]).sort()) {
        const declared = declaredDependency(key, pkg[field][key]);
        const locked = resolvedVersion(view, dir, declared);
        const named = locked.realName ? { name: locked.realName, purl: npmPurl(locked.realName), alias: key } : {};
        dependencies.push({
          manifest: path,
          field,
          ...declared,
          ...named,
          // The lock installs it from the tree: a workspace member, whatever the range says.
          ...(locked.linked && declared.kind === 'registry' ? { kind: 'workspace' } : {}),
          ...(declared.kind === 'git' ? { repository: gitRepositoryUrl(declared.range) } : {}),
          version: locked.version,
          ...(locked.version != null ? { versionFrom: locked.from } : { unknown: locked.unknown }),
          ...(locked.linked && declared.kind === 'registry' ? { kindFrom: 'the lockfile links it from the tree' } : {}),
        });
      }
    }
  }
  const byPath = new Map(manifests.map((manifest) => [manifest.path, manifest]));
  const published = publishedManifests({ doors, members, byPath, paths, dirOf, view });
  const { imports, leftOut } = importedPackages({ files, view, byPath, dependencies, members });
  return { manifests, dependencies, published, imports, leftOut };
}

// How the workspace's members were listed, for the member role's basis.
function workspaceSource(view) {
  const sources = [];
  const root = view.manifest('');
  if (Array.isArray(root?.workspaces) || Array.isArray(root?.workspaces?.packages)) sources.push('workspaces in package.json');
  if (view.tracked.has('pnpm-workspace.yaml')) sources.push('packages in pnpm-workspace.yaml');
  return sources.join(' and ') || 'the workspace';
}

// The directories a door's step installs, each with the first step that
// does, as the installed role's basis: door Release, job publish, step
// Install: npm ci in site.
function installRoles(doors) {
  const out = new Map();
  const ordered = [...doors].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  for (const door of ordered) {
    for (const site of door.installs ?? []) {
      if (out.has(site.dir)) continue;
      out.set(site.dir, `door ${door.name}, job ${site.job}, step ${site.step ?? site.index + 1}: ${site.command} in ${site.dir === '' ? 'the root' : site.dir}`);
    }
  }
  return out;
}

// The manifests a door publishes to npm, from what each door sends, its
// gated jobs' sends included: a package it names, one a loop over a glob
// finds, every member, the members a loop over the workspace picks (npm
// refuses the private ones, so each non-private member), or the one package
// under a directory the tag or the run picks, which may be any of them. A
// publish whose packages only a run decides is not expanded. Private
// manifests are left out, since npm publishes none.
function publishedManifests({ doors, members, byPath, paths, dirOf, view }) {
  const found = new Map();
  const add = (dir, door, how) => {
    const path = dir === '' ? 'package.json' : `${dir}/package.json`;
    const manifest = byPath.get(path);
    if (!manifest || manifest.private || typeof manifest.name !== 'string') return;
    if (!found.has(path)) {
      const pkg = view.manifest(dir);
      found.set(path, {
        manifest: path,
        name: manifest.name,
        purl: npmPurl(manifest.name),
        ...(manifest.version != null ? { version: manifest.version } : {}),
        repository: repositoryOf(pkg),
        doors: new Set(),
        how,
      });
    }
    found.get(path).doors.add(door.name);
  };
  for (const door of doors) {
    const looped = new Map((door.publishLoops ?? []).map((entry) => [entry.dir, entry.over]));
    for (const entry of npmSends(door)) {
      if (typeof entry.name === 'string' && entry.dir != null) add(entry.dir, door, looped.has(entry.dir) ? `a loop over ${looped.get(entry.dir)}` : 'named by the publish');
      else if (entry.workspace === 'every' || entry.workspace === true) {
        for (const dir of [...members.keys()].sort()) add(dir, door, entry.workspace === 'every' ? 'every member of the workspace' : 'a loop over the members of the workspace');
      } else if (typeof entry.under === 'string') {
        const under = entry.under.replace(/\/+$/, '');
        const chosen = entry.chosenBy === 'tag' ? 'by the tag' : 'at run time';
        for (const path of paths) {
          const dir = dirOf(path);
          if (dir.startsWith(`${under}/`) && !dir.slice(under.length + 1).includes('/')) add(dir, door, `one package under ${under}/, chosen ${chosen}`);
        }
      }
    }
  }
  return [...found.values()].sort((a, b) => (a.manifest < b.manifest ? -1 : 1)).map((entry) => ({ ...entry, doors: [...entry.doors].sort() }));
}

// The npm packages a door's publishes send, its gated jobs' with them. A
// gated job's sends are carried as keys (core/doors.js sendKeys), a package
// as its JSON after "packages:".
function npmSends(door) {
  const gated = (door.gated ?? []).flatMap((gate) => gate.sends ?? [])
    .filter((key) => key.startsWith('packages:'))
    .map((key) => JSON.parse(key.slice('packages:'.length)));
  return [...(door.sends?.packages ?? []), ...gated].filter((entry) => entry.registry === 'npm');
}

// The repository a manifest names, as one URL: its repository field, a string
// or { url }, normalised as a git dependency is. Null when it names none.
function repositoryOf(pkg) {
  const field = pkg?.repository;
  const url = typeof field === 'string' ? field : typeof field?.url === 'string' ? field.url : null;
  return url == null || url.trim() === '' ? null : gitRepositoryUrl(url);
}

// For each JavaScript or TypeScript file, the packages its bare imports name:
// static, dynamic with a literal name and require, a subpath against its
// package. Built-ins, a scheme's modules (astro:content, bun:test) and
// require.resolve, which locates a file and imports nothing, are not
// packages. Each names the manifest whose declaration covers it, found as
// resolution finds it: the nearest manifest above the file that declares the
// name or its types package; an alias records the package it names, and a
// package importing its own name is itself. A name no manifest declares is
// recorded with no manifest.
//
// Three kinds of specifier are not packages, though they look like bare
// names, and are left out and counted (R&D on slice AO): a package's own
// `#internal` imports; a name npm's rules reject, such as the `@/lib` of a
// tsconfig path alias or SvelteKit's `$lib`; and a name the resolver found
// inside the repository when no manifest declares it and it is no workspace
// member, which is a path alias or a rewrite and already a file edge. A
// tracked file reached through a declared name, a workspace member's name
// (declared or not: a monorepo's members import each other without listing
// each other) or the package's own stays: those are what the workspace and
// self kinds are.
function importedPackages({ files, view, byPath, dependencies, members }) {
  const declaredAt = new Map();
  for (const entry of dependencies) {
    const key = `${entry.manifest}\0${entry.alias ?? entry.name}`;
    if (!declaredAt.has(key)) declaredAt.set(key, entry);
  }
  const memberNames = new Set([...members.values()].filter((name) => typeof name === 'string'));
  const out = new Map();
  const leftOut = { packageInternalSites: 0, resolvedInRepositorySites: 0, notPackageNameSites: 0, names: new Map(), files: new Set() };
  for (const file of files) {
    if (!Array.isArray(file.imports) || file.language === 'python' || file.language === 'rust' || file.godot) continue;
    const seen = new Map();
    for (const site of file.imports) {
      if (site.kind !== 'static' && site.kind !== 'dynamic-literal') continue;
      if (site.location || site.locates || site.submodule) continue;
      if (typeof site.specifier === 'string' && site.specifier.startsWith('#')) {
        leftOut.packageInternalSites += 1;
        leftOut.files.add(file.path);
        tally(leftOut.names, packageNameOf(site.specifier) ?? site.specifier);
        continue;
      }
      const name = packageNameOf(site.specifier);
      if (name == null) continue;
      if (!isValidPackageName(name)) {
        leftOut.notPackageNameSites += 1;
        tally(leftOut.names, name);
        leftOut.files.add(file.path);
        continue;
      }
      const entry = coveringDeclaration(file.path, name, { byPath, declaredAt, view, memberNames });
      const inRepository = site.resolved?.outcome === 'file' || site.resolved?.outcome === 'boundary';
      if (inRepository && entry.manifest === null && !entry.member) {
        leftOut.resolvedInRepositorySites += 1;
        leftOut.files.add(file.path);
        tally(leftOut.names, name);
        continue;
      }
      seen.set(`${entry.purl}\0${entry.manifest ?? ''}`, entry);
    }
    if (seen.size > 0) out.set(file.path, [...seen.values()].sort((a, b) => (a.purl < b.purl ? -1 : a.purl > b.purl ? 1 : (a.manifest ?? '') < (b.manifest ?? '') ? -1 : 1)));
  }
  return { imports: out, leftOut };
}

function tally(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/**
 * Whether npm's naming rules for packages that already exist accept a name:
 * the rules of `validate-npm-package-name`'s validForOldPackages, so uppercase
 * names such as JSONStream stay, and a leading dot or underscore, a character
 * that is not URL-safe, an empty scope (`@/lib`) or `$lib` do not.
 *
 * @param {string} name a bare package name, scoped or not
 */
export function isValidPackageName(name) {
  if (typeof name !== 'string' || name.length === 0) return false;
  if (name.startsWith('.') || name.startsWith('_')) return false;
  if (name.trim() !== name) return false;
  if (/[~)('!*]/.test(name.split('/').pop())) return false;
  if (encodeURIComponent(name) === name) return true;
  const scoped = name.match(/^(?:@([^/]+?)[/])?([^/]+?)$/);
  if (!scoped || scoped[1] === undefined) return false;
  const [, scope, pkg] = scoped;
  if (pkg.startsWith('.')) return false;
  return encodeURIComponent(scope) === scope && encodeURIComponent(pkg) === pkg;
}

/**
 * The counts of what the package facts left out of a file's `packages`, for
 * statistics.json: how many import sites, by reason, the files they are in,
 * and the names left out, the twenty most common.
 */
export function leftOutCounts(leftOut) {
  const names = [...leftOut.names.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return {
    filesWithLeftOutImports: leftOut.files.size,
    importSitesNotPackageNames: leftOut.notPackageNameSites,
    importSitesPackageInternal: leftOut.packageInternalSites,
    importSitesResolvedInRepository: leftOut.resolvedInRepositorySites,
    namesLeftOut: Object.fromEntries(names.slice(0, 20)),
    namesLeftOutOmitted: Math.max(0, names.length - 20),
  };
}

/**
 * The package a bare specifier names, or null for one that names none: a
 * relative or absolute path, a built-in, or a module a scheme provides.
 *
 * @param {string} specifier as the import spells it
 */
export function packageNameOf(specifier) {
  if (typeof specifier !== 'string' || specifier === '') return null;
  if (specifier.startsWith('.') || specifier.startsWith('/') || /^[A-Za-z]:[\\/]/.test(specifier) || specifier.startsWith('~')) return null;
  if (isNodeBuiltin(specifier)) return null;
  const parts = specifier.split('/');
  const name = specifier.startsWith('@') ? (parts.length >= 2 && parts[1] !== '' ? `${parts[0]}/${parts[1]}` : null) : parts[0];
  if (!name || /^[A-Za-z][\w+.-]*:/.test(name)) return null;
  return name;
}

function coveringDeclaration(path, name, { byPath, declaredAt, view, memberNames }) {
  let dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  for (;;) {
    const manifest = dir === '' ? 'package.json' : `${dir}/package.json`;
    if (byPath.has(manifest)) {
      const declared = declaredAt.get(`${manifest}\0${name}`) ?? declaredAt.get(`${manifest}\0${typesPackageOf(name)}`);
      if (declared) return { purl: declared.purl, manifest };
      if (byPath.get(manifest).name === name) return { purl: npmPurl(name), manifest, self: true };
    }
    if (dir === '') break;
    dir = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '';
  }
  return { purl: npmPurl(name), manifest: null, ...(memberNames.has(name) ? { member: true } : {}) };
}

// The package that carries a package's types alone: @types/estree for
// estree, @types/babel__core for @babel/core.
function typesPackageOf(name) {
  return name.startsWith('@') ? `@types/${name.slice(1).replace('/', '__')}` : `@types/${name}`;
}

function isMapping(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
