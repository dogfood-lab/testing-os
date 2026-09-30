/**
 * The command a step hands an action to run (docs/atlas-production.spec.md,
 * Part 6). A step that uses a wrapper action known to run one of its inputs
 * as a shell command is read as a step that runs that command, so the map
 * and the door checks see the program. Any other input that looks like a
 * shell command, on any action, is returned unresolved with why: Atlas does
 * not know what the action does with it, so it is never guessed as a run.
 *
 * The wrappers were chosen by measurement: over the fleet's default
 * branches (2026-09-30, 79 repositories, 1,980 uses: steps), the only
 * command-shaped inputs were nick-fields/retry's `command`. Wandalen's
 * wretry.action is its documented equivalent.
 */

// The action, lowercased as GitHub matches owner and name, to the input it
// runs as a command, the input naming the shell it runs it with, and the
// input naming the directory it runs it in. With none named, the command
// runs in the workspace: a job's defaults.run applies to run steps alone.
const WRAPPERS = new Map([
  ['nick-fields/retry', { command: 'command', shell: 'shell' }],
  ['wandalen/wretry.action', { command: 'command', dir: 'current_path' }],
]);

// The shells whose text Atlas reads as it reads a run step's.
const SHELLS = new Set(['bash', 'sh']);

// Programs an input value starting with one of, and handing it an argument,
// is read as a shell command. A bare name (cache: npm) is a setting.
const COMMAND_PROGRAMS = new Set([
  'node', 'npm', 'npx', 'pnpm', 'yarn', 'python', 'python3', 'pytest', 'pip', 'pip3', 'uv', 'uvx',
  'bash', 'sh', 'make', 'cargo', 'dotnet', 'go', 'deno', 'bun', 'tsx',
]);

const UNKNOWN_ACTION = 'Atlas does not know the action to run its inputs as commands';
const APART = 'the action runs that input apart from its command, and Atlas reads only the command';

/**
 * The program a value starts, when the value reads as a shell command, or
 * null.
 *
 * @param {unknown} value
 */
export function commandProgram(value) {
  if (typeof value !== 'string') return null;
  const line = value.split('\n').map((entry) => entry.trim()).find((entry) => entry !== '' && !entry.startsWith('#'));
  if (line == null) return null;
  const words = line.split(/\s+/);
  return words.length >= 2 && COMMAND_PROGRAMS.has(words[0]) ? words[0] : null;
}

/**
 * What a uses: step hands its action to run.
 *
 * @param {{ uses: string, with?: unknown }} step
 * @returns {{ action: string, run: string|null, dir: string, unresolved: Array<{ input: string, program: string, why: string }> }}
 */
export function actionCommand(step) {
  const action = step.uses.replace(/@.*$/, '');
  const inputs = step.with != null && typeof step.with === 'object' && !Array.isArray(step.with) ? step.with : {};
  const wrapper = WRAPPERS.get(action.toLowerCase()) ?? null;
  let run = null;
  const unresolved = [];
  for (const [input, value] of Object.entries(inputs)) {
    if (wrapper && input === wrapper.command && typeof value === 'string' && value.trim() !== '') {
      const shell = wrapper.shell && typeof inputs[wrapper.shell] === 'string' ? inputs[wrapper.shell].trim() : null;
      if (shell == null || shell === '' || SHELLS.has(shell)) {
        run = value;
        continue;
      }
      const program = value.trim().split(/\s+/)[0];
      unresolved.push({ input, program, why: `the action runs it with ${shell}, a shell Atlas does not read` });
      continue;
    }
    const program = commandProgram(value);
    if (program != null) unresolved.push({ input, program, why: wrapper ? APART : UNKNOWN_ACTION });
  }
  const dir = wrapper?.dir && typeof inputs[wrapper.dir] === 'string' ? inputs[wrapper.dir] : '.';
  return { action, run, dir, unresolved: unresolved.sort((a, b) => (a.input < b.input ? -1 : a.input > b.input ? 1 : 0)) };
}
