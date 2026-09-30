import { spawnSync } from 'node:child_process';

/**
 * The Atlas engine the tool runs: by default the target version from npm,
 * run with `npx --yes` in the directory it maps, as a fleet workflow runs it;
 * with `engine`, a local build's cli.js run by this Node, for a version not
 * yet on npm. Either way the map it makes is refused unless it records the
 * target version (plan.mjs), so a local build cannot stand in for another
 * version.
 *
 * @param {{ version: string, engine?: string | null, exec: (command: string, args: string[], cwd: string) => { status: number, stdout: string, stderr: string } }} options
 * @returns {{ label: string, run: (verb: string, cwd: string) => { status: number, stdout: string, stderr: string } }}
 */
export function engineRunner({ version, engine = null, exec }) {
  if (engine) return { label: engine, run: (verb, cwd) => exec(process.execPath, [engine, verb], cwd) };
  const spec = `@dogfood-lab/atlas@${version}`;
  return { label: spec, run: (verb, cwd) => exec('npx', ['--yes', spec, verb], cwd) };
}

/**
 * Runs a command and keeps its output. npx is a .cmd script on Windows, which
 * Node starts only through a shell; everything else runs without one.
 *
 * @param {NodeJS.ProcessEnv} env
 */
export function commandRunner(env) {
  return (command, args, cwd) => {
    const result = spawnSync(command, args, {
      cwd,
      env,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      shell: command === 'npx' && process.platform === 'win32',
    });
    return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: `${result.stderr ?? ''}${result.error ? result.error.message : ''}` };
  };
}

/** The last lines of a run's output, for a reason a person reads. */
export function tail(result, lines = 12) {
  return `${result.stdout}${result.stderr}`.trim().split('\n').slice(-lines).join('\n');
}
