import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { simpleCommands } from './lib/codecov/shell.mjs';

// Each command's words as text, and the text at each word's span.
function words(text) {
  return simpleCommands(text).map((command) => command.words.map((word) => word.text));
}

describe('the shell reader', () => {
  it('reads a plain command and where each word sits', () => {
    const [command] = simpleCommands('pnpm test:coverage');
    assert.deepEqual(command.words, [
      { text: 'pnpm', start: 0, end: 4 },
      { text: 'test:coverage', start: 5, end: 18 },
    ]);
    assert.equal(command.nested, false);
  });

  it('keeps redirections out of the words and splits a pipeline', () => {
    const text = 'npm run test:coverage 2>&1 | tee test-output.txt';
    assert.deepEqual(words(text), [['npm', 'run', 'test:coverage'], ['tee', 'test-output.txt']]);
    const [first] = simpleCommands(text);
    assert.equal(text.slice(0, first.words.at(-1).end), 'npm run test:coverage');
  });

  it('carries a command across a line continuation', () => {
    const text = 'pytest tests/ -v --tb=short \\\n  --cov=audiobooker --cov-report=xml --cov-report=term-missing\n';
    const [command] = simpleCommands(text);
    assert.deepEqual(command.words.map((word) => word.text), ['pytest', 'tests/', '-v', '--tb=short', '--cov=audiobooker', '--cov-report=xml', '--cov-report=term-missing']);
    assert.equal(command.words.at(-1).end, text.length - 1);
  });

  it('reads past a heredoc body', () => {
    const text = "pytest tests/ -x --junitxml=junit.xml\npython <<'PY'\nimport sys\nprint('a | b && c')\nPY\necho done\n";
    assert.deepEqual(words(text), [['pytest', 'tests/', '-x', '--junitxml=junit.xml'], ['python'], ['echo', 'done']]);
  });

  it('reads quotes as the shell does, and spans the quotes', () => {
    const text = 'pytest tests/ ${PARALLEL_FLAGS} -m "not gpu and not slow"';
    const [command] = simpleCommands(text);
    assert.deepEqual(command.words.map((word) => word.text), ['pytest', 'tests/', '${PARALLEL_FLAGS}', '-m', 'not gpu and not slow']);
    assert.equal(command.words.at(-1).end, text.length);
  });

  it('reads the commands a substitution runs, marked nested', () => {
    const text = 'COV_FLOOR=$(python -c "import tomllib; print(1)")\necho "$COV_FLOOR"';
    const commands = simpleCommands(text);
    assert.deepEqual(commands.map((command) => [command.words.map((word) => word.text), command.nested]), [
      [['python', '-c', 'import tomllib; print(1)'], true],
      [['COV_FLOOR=$(python -c "import tomllib; print(1)")'], false],
      [['echo', '$COV_FLOOR'], false],
    ]);
  });

  it('leaves comments out and splits on the shell\'s separators', () => {
    const text = '# run the tests\nset -euo pipefail\nif [ "$X" = "1" ]; then\n  FLAGS="-n auto" # parallel\nfi\nnpm ci && npm test || exit 1';
    assert.deepEqual(words(text), [
      ['set', '-euo', 'pipefail'],
      ['if', '[', '$X', '=', '1', ']'],
      ['then'],
      ['FLAGS=-n auto'],
      ['fi'],
      ['npm', 'ci'],
      ['npm', 'test'],
      ['exit', '1'],
    ]);
  });

  it('reads a redirection spelled apart from its target', () => {
    assert.deepEqual(words('vitest run > out.txt 2> err.txt --coverage'), [['vitest', 'run', '--coverage']]);
  });

  it('reads backticks, escapes inside double quotes, and a continuation written with CRLF', () => {
    const text = 'echo "a \\"quoted\\" `date`" `whoami` \\\r\n  --flag\r\n';
    const commands = simpleCommands(text);
    assert.deepEqual(commands.map((command) => [command.words.map((word) => word.text), command.nested]), [
      [['date'], true],
      [['whoami'], true],
      [['echo', 'a "quoted" `date`', '`whoami`', '--flag'], false],
    ]);
  });

  it('reads to the end of the text when a substitution, a parameter or a backtick never closes', () => {
    assert.deepEqual(words('echo $(date "x\\"y" \\) end'), [['date', 'x"y', ')', 'end'], ['echo', '$(date "x\\"y" \\) end']]);
    assert.deepEqual(words('echo ${HOME'), [['echo', '${HOME']]);
    assert.deepEqual(words('echo `date \\` x'), [['date', '`', 'x'], ['echo', '`date \\` x']]);
  });
});
