import { parseBoundaryText } from '../adapter/boundary-file.js';
import { gitRepositoryUrl } from '../core/package-facts.js';
import { asName } from './data.js';
import { group } from './answer.js';
import { filesAt, git, inHistory } from './git.js';
import { readSnapshotAt } from './map.js';
import { publishedAt, TAG_FORM_NAMES } from './tags.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "Consumers in the workspace" (docs/atlas-buildup.spec.md, slice AP): for a
 * file in one repository, the other repositories Atlas answers for whose
 * maps declare a package that repository publishes and that contains the
 * file. The join is made here, at question time, from the facts each map
 * already holds (slice AO: what a repository publishes, what it declares);
 * nothing is stored in a map, so each map stays a fact about its own
 * repository.
 *
 * What it will not say: that a consumer "will break". It says which
 * repositories declare the package, at what range and resolved version, how
 * the link between the two was established, and how the producer's map
 * stands against the version the consumer resolved. A zero is never said
 * while Atlas cannot see everywhere the package could be used: it then says
 * the consumers are unverified, and what it could not read.
 */

// How a consumer is tied to the producer, firmest first. `attested` (a
// provenance attestation, SLSA) needs the registry and is unreachable here.
export const LINK_BASES = Object.freeze(['manual', 'repository', 'unverified']);

// Package ecosystems whose manifests Atlas does not extract: a file under
// one of these may be published in a package whose consumers cannot be read.
const UNREAD_ECOSYSTEMS = [
  { name: 'PyPI', files: ['pyproject.toml', 'setup.py', 'setup.cfg'] },
  { name: 'Cargo', files: ['Cargo.toml'] },
  { name: 'NuGet', files: ['Directory.Packages.props', 'packages.config'], suffixes: ['.csproj', '.fsproj'] },
];

function dirOf(path) {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
}

function contains(dir, file) {
  return dir === '' || file === dir || file.startsWith(`${dir}/`);
}

function normal(url) {
  return typeof url === 'string' && url !== '' ? gitRepositoryUrl(url).toLowerCase() : null;
}

/** The producer root's origin, normalised; credentials in the URL never leave it. */
function originOf(root) {
  const read = git(root, ['config', '--get', 'remote.origin.url']);
  return read.ok ? normal(String(read.stdout).trim()) : null;
}

// The files of a mapped repository, from its structure.
function trackedPaths(structure) {
  return new Set([...(structure.boundaries ?? []).flatMap((boundary) => (boundary.files ?? []).map((file) => file.path)), ...(structure.unassigned ?? []).map((file) => file.path)]);
}

// The unextracted ecosystems whose manifests sit at or above a file.
function unreadEcosystemsAbove(paths, file) {
  const found = [];
  for (const ecosystem of UNREAD_ECOSYSTEMS) {
    let dir = dirOf(file);
    for (;;) {
      const names = [...paths].filter((path) => dirOf(path) === dir);
      const hit = names.some((path) => {
        const base = path.slice(path.lastIndexOf('/') + 1);
        return ecosystem.files.includes(base) || (ecosystem.suffixes ?? []).some((suffix) => base.endsWith(suffix));
      });
      if (hit) {
        found.push(ecosystem.name);
        break;
      }
      if (dir === '') break;
      dir = dirOf(dir);
    }
  }
  return found;
}

// The producers a consumer's boundary file names, as it was at the commit
// its map was made from; a tree exported without history is read from disk.
function manualProducers(consumer, snapshot) {
  let text = null;
  if (consumer.exported) {
    try {
      text = readFileSync(join(consumer.root, 'atlas', 'boundaries.yaml'), 'utf8');
    } catch {
      text = null;
    }
  } else {
    const read = filesAt(consumer.root, snapshot.commit, ['atlas/boundaries.yaml']).get('atlas/boundaries.yaml');
    text = read ? read.toString('utf8') : null;
  }
  if (text == null) return [];
  const parsed = parseBoundaryText(text);
  return parsed.ok ? parsed.producers : [];
}

function sameRepository(root, name) {
  return name === root.name || name === root.real || name === root.root;
}

// What the producer's map stands at against the version a consumer resolved.
function skewOf({ producer, snapshot, name, version }) {
  const published = publishedAt(producer.root, name, version);
  const base = { tried: published.tried, ...(published.left ? { notTried: published.left } : {}) };
  if (published.state !== 'found') return { state: 'unknown', reason: published.reason, ...base, published };
  const tag = { tag: published.tag, form: published.form, taggedCommit: published.commit };
  if (published.commit === snapshot.commit) return { state: 'match', ...base, ...tag, published };
  if (inHistory(producer.root, published.commit, snapshot.commit)) return { state: 'ahead', ...base, ...tag, published };
  if (inHistory(producer.root, snapshot.commit, published.commit)) return { state: 'behind', ...base, ...tag, published };
  return { state: 'unknown', reason: 'the tagged commit and the map\'s commit are on different lines of history', ...base, ...tag, published };
}

/**
 * @param {object} input
 * @param {{ name: string, root: string, real?: string, key?: string }} input.producer the repository asked about
 * @param {object} input.snapshot the producer's map
 * @param {string[]} input.files the files asked about
 * @param {{ roots: object[], snapshotOf: (root: object) => ({ ok: boolean, snapshot?: object, error?: object }) }} input.workspace
 * @returns {{ facts: object[], cannotSee: object[], sentences: string[] }}
 */
export function consumersFor({ producer, snapshot, files, workspace }) {
  const structure = snapshot.structure;
  const published = structure.packagesPublished ?? [];
  const tracked = trackedPaths(structure);
  const others = workspace.roots.filter((root) => root.key !== producer.key);

  // The published packages whose directory holds each file asked about.
  const packages = new Map();
  const unread = new Set();
  const inNoPackage = [];
  for (const file of files) {
    const holding = published.filter((entry) => contains(dirOf(entry.manifest), file));
    for (const entry of holding) packages.set(entry.manifest, { ...entry, files: [...(packages.get(entry.manifest)?.files ?? []), file] });
    for (const ecosystem of unreadEcosystemsAbove(tracked, file)) unread.add(ecosystem);
    if (holding.length === 0) inNoPackage.push(file);
  }

  const facts = [];
  const cannotSee = [];
  const sentences = [];
  const note = (reason, extra = {}) => cannotSee.push({ basis: 'outside', what: 'consumer', grain: 'repository', count: 0, named: [], reason, ...extra });

  if (packages.size === 0 && unread.size === 0) return { facts, cannotSee, sentences };

  const origin = originOf(producer.root);
  const mapped = [];
  const unmapped = [];
  for (const other of others) {
    const read = workspace.snapshotOf(other);
    if (read.ok) mapped.push({ root: other, snapshot: read.snapshot });
    else unmapped.push({ name: other.name, why: read.error?.code ?? 'no map' });
  }

  const links = [];
  const orphans = [];
  const taggedAt = new Map();
  for (const entry of [...packages.values()].sort((a, b) => (a.manifest < b.manifest ? -1 : 1))) {
    for (const { root, snapshot: theirs } of mapped) {
      const manual = manualProducers(root, theirs);
      const declared = (theirs.structure.packageDependencies ?? []).filter((dependency) => dependency.purl === entry.purl);
      const claim = manual.find((item) => item.package === entry.name);
      for (const dependency of declared) {
        // A consumer that names another repository as this package's producer
        // is not a consumer of this one.
        if (claim && !sameRepository(producer, claim.repository)) continue;
        let linkBasis;
        let why = null;
        if (claim) linkBasis = 'manual';
        else if (entry.repository && origin && normal(entry.repository) === origin) linkBasis = 'repository';
        else {
          linkBasis = 'unverified';
          why = !entry.repository ? 'the producer\'s manifest names no repository'
            : !origin ? 'the producer\'s clone has no origin remote to compare with'
              : 'the producer\'s manifest names a repository other than its clone\'s origin';
        }
        const key = `${entry.manifest}\0${dependency.version ?? ''}`;
        if (!taggedAt.has(key)) taggedAt.set(key, skewOf({ producer, snapshot, name: entry.name, version: dependency.version ?? null }));
        const skew = taggedAt.get(key);
        const atPublished = atPublishedCommit({ producer, skew, entry });
        links.push({
          linkBasis,
          item: {
            consumer: root.name,
            package: entry.name,
            purl: entry.purl,
            producerManifest: entry.manifest,
            files: entry.files,
            consumerManifest: dependency.manifest,
            field: dependency.field,
            range: dependency.range,
            kind: dependency.kind,
            resolvedVersion: dependency.version ?? null,
            ...(dependency.version == null && dependency.unknown ? { resolvedUnknown: dependency.unknown } : {}),
            ...(why ? { why } : {}),
            producerMap: { commit: snapshot.commit, engine: snapshot.engine ?? null },
            consumerMap: { commit: theirs.commit, engine: theirs.engine ?? null },
            skew: {
              state: skew.state,
              tried: skew.tried,
              ...(skew.reason ? { reason: skew.reason } : {}),
              ...(skew.tag ? { tag: skew.tag, taggedCommit: skew.taggedCommit } : {}),
              ...(atPublished ? { atPublishedCommit: atPublished } : {}),
            },
          },
        });
      }
    }
  }

  // A mapping a consumer states by hand for a producer Atlas has no map for.
  for (const { root, snapshot: theirs } of mapped) {
    for (const claim of manualProducers(root, theirs)) {
      const target = workspace.roots.find((other) => sameRepository(other, claim.repository));
      const producing = target ? workspace.snapshotOf(target) : null;
      if (!target) orphans.push({ consumer: root.name, package: claim.package, repository: claim.repository, why: 'the repository is not one Atlas answers for' });
      else if (!producing.ok) orphans.push({ consumer: root.name, package: claim.package, repository: target.name, why: 'the repository has no map Atlas can answer from' });
    }
  }

  for (const basis of LINK_BASES) {
    const items = links.filter((link) => link.linkBasis === basis).map((link) => link.item)
      .sort((a, b) => (a.consumer < b.consumer ? -1 : a.consumer > b.consumer ? 1 : a.consumerManifest < b.consumerManifest ? -1 : 1));
    if (items.length > 0) facts.push(group('consumers', 'declared', items, { linkBasis: basis }));
  }
  if (orphans.length > 0) facts.push(group('orphanProducers', 'declared', orphans));

  const consumerNames = [...new Set(links.map((link) => link.item.consumer))].sort();
  const complete = unread.size === 0 && unmapped.length === 0;
  facts.push(group('consumerSearch', 'declared', [{
    packages: [...packages.values()].map((entry) => ({ package: entry.name, purl: entry.purl, manifest: entry.manifest, version: entry.version ?? null })),
    searched: mapped.map((entry) => entry.root.name).sort(),
    declaring: consumerNames,
    notRead: unmapped,
    ecosystemsNotRead: [...unread].sort(),
    complete,
    status: complete ? 'searched' : 'unverified',
  }]));

  // What Atlas cannot see here, in the question's own terms.
  if (unread.size > 0) {
    cannotSee.push({
      basis: 'outside', what: 'consumer', grain: 'repository', count: unread.size, where: 'another-repository',
      named: [...unread].sort(), reason: 'a file asked about sits in a package of an ecosystem Atlas does not extract (PyPI and uv, Cargo, NuGet), so the repositories that depend on it are not readable',
    });
  }
  if (unmapped.length > 0) {
    cannotSee.push({
      basis: 'unresolved', what: 'consumer', grain: 'repository', count: unmapped.length,
      named: unmapped.map((entry) => entry.name), reason: 'repositories among the roots with no map Atlas can answer from, which may declare the package',
    });
  }
  note('provenance attestations (need the registry): a link is never called attested');
  note('which files a published package ships: a file counts as in a package when it is under the manifest\'s directory, and the package\'s files and exports lists are not read');
  note('tags may be stale: the producer\'s release tags are read from this clone only, and a shallow clone or one whose tags were never fetched gives unknown, never a match');
  note('consumers outside the roots Atlas answers for, private repositories it was not given, runtime loading, the version actually installed, and whether the consumers\' tests cover the call site');

  // Sentences, in Atlas's voice; every name taken from a repository is data.
  const named = (list, count = 6) => (list.length <= count ? list.map(asName).join(', ') : `${list.slice(0, count).map(asName).join(', ')} and ${list.length - count} more`);
  for (const entry of [...packages.values()]) {
    const mine = links.filter((link) => link.item.package === entry.name && link.item.producerManifest === entry.manifest);
    const who = [...new Set(mine.map((link) => link.item.consumer))].sort();
    const heard = mapped.length;
    sentences.push(`Atlas: ${named(entry.files)} ${entry.files.length === 1 ? 'is' : 'are'} in ${asName(entry.name)}, which this repository publishes (${asName(entry.manifest)}).`);
    if (who.length > 0) {
      sentences.push(`Atlas: ${who.length} of ${heard} other ${heard === 1 ? 'repository' : 'repositories'} among the roots ${who.length === 1 ? 'declares' : 'declare'} ${asName(entry.name)}: ${named(who)}.`);
    } else {
      sentences.push(complete
        ? `Atlas: none of the ${heard} other ${heard === 1 ? 'repository' : 'repositories'} among the roots declares ${asName(entry.name)}; consumers outside the roots stay unseen.`
        : `Atlas: no repository among the roots Atlas could read declares ${asName(entry.name)}; the consumers are unverified (see what Atlas cannot see).`);
    }
  }
  for (const link of links) {
    const item = link.item;
    const resolved = item.resolvedVersion ? `resolved ${asName(item.resolvedVersion)}` : `resolved version unknown (${asName(item.resolvedUnknown ?? 'not recorded')})`;
    const skew = item.skew.state === 'unknown'
      ? `unknown (${asName(item.skew.reason)}; tried ${item.skew.tried.length > 0 ? item.skew.tried.join(', ') : 'no tag'})`
      : `${item.skew.state} (tag ${asName(item.skew.tag)})`;
    const basis = link.linkBasis === 'unverified' ? `unverified: ${item.why}` : `${link.linkBasis} basis`;
    sentences.push(`Atlas: ${asName(item.consumer)} declares ${asName(item.package)} at ${asName(item.range)} in ${asName(item.consumerManifest)}, ${resolved}; the producer's map is ${skew}; link ${basis}.`);
  }
  for (const orphan of orphans) {
    sentences.push(`Atlas: ${asName(orphan.consumer)} names ${asName(orphan.repository)} as the producer of ${asName(orphan.package)}, but ${orphan.why}.`);
  }
  if (unread.size > 0) sentences.push(`Atlas: a file asked about is in a package of an ecosystem Atlas does not extract (${[...unread].sort().join(', ')}); its consumers are unverified, not none.`);
  if (unmapped.length > 0) sentences.push(`Atlas: ${named(unmapped.map((entry) => entry.name))} ${unmapped.length === 1 ? 'has' : 'have'} no map Atlas can answer from, so ${unmapped.length === 1 ? 'it was' : 'they were'} not searched.`);
  if (links.some((link) => link.item.skew.state !== 'unknown') === false && links.length > 0) {
    sentences.push(`Atlas: the producer's tags were tried in the forms ${TAG_FORM_NAMES.join(', ')} and none matched a resolved version.`);
  }
  return { facts, cannotSee, sentences };
}

// When the version a consumer resolved was published from another commit, the
// map at that commit if the clone holds one: does it hold the file asked about,
// in the package, there? Null when the commit is the map's own or unknown.
const AT_PUBLISHED = new WeakMap();

function atPublishedCommit({ producer, skew, entry }) {
  if (skew.state !== 'ahead' && skew.state !== 'behind') return null;
  const key = skew.taggedCommit;
  const cache = AT_PUBLISHED.get(producer) ?? new Map();
  AT_PUBLISHED.set(producer, cache);
  if (!cache.has(key)) cache.set(key, readSnapshotAt(producer.root, key));
  const read = cache.get(key);
  if (!read.ok) return { map: false };
  const there = (read.snapshot.structure.packagesPublished ?? []).find((item) => item.manifest === entry.manifest);
  if (!there) return { map: true, publishesPackage: false };
  const present = trackedPaths(read.snapshot.structure);
  return { map: true, publishesPackage: true, holdsFiles: entry.files.map((file) => ({ file, present: present.has(file) })) };
}
