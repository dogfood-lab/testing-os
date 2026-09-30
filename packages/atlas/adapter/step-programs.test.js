import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stepPrograms } from './artifact.js';

/**
 * The programs a step's script runs (adapter/artifact.js stepPrograms), which
 * the map keeps in place of the script and `atlas explain` prints for a
 * workflow's jobs. Shell arithmetic runs nothing: a name inside `$(( ))` or
 * `(( ))` is a variable, and printing it as a program is a wrong fact.
 */

describe('stepPrograms: shell arithmetic names no program', () => {
  it('an arithmetic expansion in an argument', () => {
    assert.deepEqual(stepPrograms('sleep $((attempt * 5))'), ['sleep']);
  });

  it('an arithmetic expansion assigned to a variable', () => {
    assert.deepEqual(stepPrograms('n=$((n + 1))'), []);
  });

  it('nested parentheses inside the expansion', () => {
    assert.deepEqual(stepPrograms('sleep $(( (attempt + 1) * 5 ))'), ['sleep']);
  });

  it('an arithmetic command, alone and after a loop keyword', () => {
    assert.deepEqual(stepPrograms('((attempt++))'), []);
    assert.deepEqual(stepPrograms('while ((tries < 3)); do\n  curl -s x\ndone'), ['curl']);
  });

  it('a retry loop as a workflow writes it', () => {
    const script = [
      'for attempt in 1 2 3 4 5; do',
      '  status=$(curl -s -o /dev/null -w "%{http_code}" "$url")',
      '  echo "attempt $attempt: HTTP $status"',
      '  sleep $((attempt * 5))',
      'done',
    ].join('\n');
    assert.deepEqual(stepPrograms(script), ['curl', 'echo', 'sleep']);
  });
});

describe('stepPrograms: what is not arithmetic is still read', () => {
  it('a command substitution', () => {
    assert.deepEqual(stepPrograms('status=$(curl -s "$url")'), ['curl']);
  });

  it('a subshell inside a command substitution, which also opens with two parentheses', () => {
    assert.deepEqual(stepPrograms('out=$((cd site && make build) | tee log.txt)'), ['cd', 'make', 'tee']);
  });
});
