/**
 * Loaded before every test file in this repository (`node --test --import`,
 * named in each workspace's test script and in the root test:scripts), so
 * every git a test runs, and every process those tests start, inherits it.
 *
 * A commit or a merge ends by starting `git maintenance run --auto --detach`,
 * which repacks and prunes under .git moments later. In a test's temporary
 * repository that background work races the test's own cleanup (`ENOTEMPTY`
 * removing .git) and any assertion that .git was left as it was. Turning it
 * off here, through git's environment configuration, covers every repository
 * a test creates, however it creates it, without each test having to say so.
 * A process a test starts with an environment built from nothing does not
 * inherit it.
 */

export const MAINTENANCE_OFF = Object.freeze([
  ['maintenance.auto', 'false'],
  ['gc.auto', '0'],
]);

/**
 * The environment with git's background maintenance turned off: each setting
 * appended after the configuration the environment already carries, and none
 * added twice, so loading this again in a child process changes nothing.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {NodeJS.ProcessEnv}
 */
export function withMaintenanceOff(env) {
  const parsed = Number.parseInt(env.GIT_CONFIG_COUNT ?? '', 10);
  let count = Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
  const present = new Set();
  for (let i = 0; i < count; i += 1) present.add(`${env[`GIT_CONFIG_KEY_${i}`]}=${env[`GIT_CONFIG_VALUE_${i}`]}`);
  const next = { ...env };
  for (const [key, value] of MAINTENANCE_OFF) {
    if (present.has(`${key}=${value}`)) continue;
    next[`GIT_CONFIG_KEY_${count}`] = key;
    next[`GIT_CONFIG_VALUE_${count}`] = value;
    count += 1;
  }
  if (count > 0) next.GIT_CONFIG_COUNT = String(count);
  return next;
}

const quiet = withMaintenanceOff(process.env);
for (const [key, value] of Object.entries(quiet)) {
  if (process.env[key] !== value) process.env[key] = value;
}
