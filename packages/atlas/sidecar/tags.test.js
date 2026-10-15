import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { git as read } from './git.js';
import { mayBeGivenToGit, publishedAt, tagsFor, TAG_FORM_NAMES } from './tags.js';
import { commitAll, git } from './test-client.js';

// docs/atlas-buildup.spec.md, slice AP (the amendments of 2026-10-15): a
// version read from a consumer's lockfile and a name read from a producer's
// manifest become a tag name in a third repository. These are the attacks on
// that step and the forms it tries. The security brief for AP points here.

const scratchRoots = [];
let repo;
let commits;
let shallow;

function scratch(prefix) {
  const path = realpathSync.native(mkdtempSync(join(tmpdir(), prefix)));
  scratchRoots.push(path);
  return path;
}

before(() => {
  repo = scratch('atlas-tags-');
  git(repo, ['init', '-q']);
  for (const [key, value] of [['core.autocrlf', 'false'], ['maintenance.auto', 'false'], ['gc.auto', '0']]) git(repo, ['config', key, value]);
  writeFileSync(join(repo, 'a.txt'), 'one\n');
  commitAll(repo, 'one');
  const first = git(repo, ['rev-parse', 'HEAD']);
  git(repo, ['tag', 'v1.0.0']);
  writeFileSync(join(repo, 'a.txt'), 'two\n');
  commitAll(repo, 'two');
  const second = git(repo, ['rev-parse', 'HEAD']);
  git(repo, ['tag', '2.0.0']);
  git(repo, ['tag', '@acme/lib@3.0.0']);
  git(repo, ['tag', '@acme/lib-v4.0.0']);
  // A branch that carries a release's name is no release.
  git(repo, ['branch', 'v5.0.0']);
  commits = { first, second };
  // A shallow clone holds only its tip, so the older tag is not in it.
  shallow = scratch('atlas-tags-shallow-');
  rmSync(shallow, { recursive: true, force: true });
  git(tmpdir(), ['clone', '-q', '--depth', '1', pathToFileURL(repo).href, shallow]);
});

after(() => {
  while (scratchRoots.length > 0) rmSync(scratchRoots.pop(), { recursive: true, force: true });
});

describe('the tag forms', () => {
  it('are v<version>, <version>, <name>@<version> and <name>-v<version>, in that order, and the answer names them', () => {
    assert.deepEqual(TAG_FORM_NAMES, ['v<version>', '<version>', '<name>@<version>', '<name>-v<version>']);
    assert.deepEqual(tagsFor('@acme/lib', '1.2.3').forms.map((entry) => entry.tag), ['v1.2.3', '1.2.3', '@acme/lib@1.2.3', '@acme/lib-v1.2.3'], 'a scoped name is whole in the name forms');
  });

  it('find a tag in each form and say which one matched', () => {
    assert.deepEqual(publishedAt(repo, 'x', '1.0.0'), { state: 'found', tried: ['v<version>'], tag: 'v1.0.0', form: 'v<version>', commit: commits.first });
    assert.equal(publishedAt(repo, 'x', '2.0.0').form, '<version>');
    assert.equal(publishedAt(repo, '@acme/lib', '3.0.0').form, '<name>@<version>');
    const named = publishedAt(repo, '@acme/lib', '4.0.0');
    assert.equal(named.form, '<name>-v<version>');
    assert.deepEqual(named.tried, TAG_FORM_NAMES, 'it tried all four, in order, to get there');
    assert.equal(named.commit, commits.second);
  });

  it('say unknown, with the forms tried, when no local tag is there', () => {
    const none = publishedAt(repo, '@acme/lib', '9.9.9');
    assert.equal(none.state, 'none');
    assert.deepEqual(none.tried, TAG_FORM_NAMES);
    assert.equal(none.reason, 'no local tag for 9.9.9');
  });

  it('read a shallow clone as unknown, never as a tag that is not there', () => {
    const answer = publishedAt(shallow, 'x', '1.0.0');
    assert.equal(answer.state, 'unknown');
    assert.match(answer.reason, /shallow/);
  });
});

describe('a value from another repository', () => {
  it('that begins with - is refused before git is started', () => {
    for (const version of ['--upload-pack=touch x', '-1.0.0', '-v1.0.0']) {
      const answer = publishedAt(repo, 'x', version);
      assert.equal(answer.state, 'unknown', version);
      assert.deepEqual(answer.tried, [], `${version}: git was never asked`);
    }
    assert.equal(mayBeGivenToGit('-x'), false);
    assert.equal(mayBeGivenToGit('--end-of-options'), false);
    // A name that begins with - leaves the name forms out; the others are still tried.
    const dash = tagsFor('-pkg', '1.0.0');
    assert.deepEqual(dash.forms.map((entry) => entry.form), ['v<version>', '<version>']);
    assert.deepEqual(dash.left, ['<name>@<version>', '<name>-v<version>']);
    assert.deepEqual(publishedAt(repo, '-pkg', '1.0.0').notTried ?? publishedAt(repo, '-pkg', '1.0.0').left, ['<name>@<version>', '<name>-v<version>']);
  });

  it('that is no release version is not made into a tag name', () => {
    for (const version of ['^1.2.3', '1.2', 'latest', 'file:../x', '1.2.3 ', '1.2.3/../x', '1.2.3\n--x', 'refs/heads/main']) {
      const answer = publishedAt(repo, 'x', version);
      assert.equal(answer.state, 'unknown', JSON.stringify(version));
      assert.deepEqual(answer.tried, [], JSON.stringify(version));
    }
  });

  it('that cannot be a ref name is skipped, not passed on', () => {
    // a..b is a valid old package name, and refs/tags/a..b@1.0.0 is no ref.
    const answer = publishedAt(repo, 'a..b', '1.0.0');
    assert.equal(answer.state, 'found', 'the v<version> form still finds the tag');
    const dotted = publishedAt(repo, 'a..b', '7.0.0');
    assert.equal(dotted.state, 'none');
    assert.deepEqual(dotted.tried, TAG_FORM_NAMES, 'the name forms were tried without error');
  });

  it('is read only as refs/tags/<name>: a branch of the same name is no tag', () => {
    const answer = publishedAt(repo, 'x', '5.0.0');
    assert.equal(answer.state, 'none', 'a branch named v5.0.0 exists and is not a release');
  });
});

describe('the read-only git helper', () => {
  it('reads a config value and checks a ref name, and refuses a config write', () => {
    assert.equal(read(repo, ['check-ref-format', 'refs/tags/v1.0.0']).ok, true);
    assert.equal(read(repo, ['check-ref-format', 'refs/tags/a..b']).ok, false);
    assert.throws(() => read(repo, ['config', 'user.name', 'x']), /is not a read command/);
    assert.throws(() => read(repo, ['config', '--unset', 'core.autocrlf']), /is not a read command/);
    assert.equal(read(repo, ['config', '--get', 'core.autocrlf']).ok, true);
  });
});
