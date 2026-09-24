import { posix } from 'node:path';
import { isTestMaterial } from './landings.js';

/**
 * What the repository holds that the map, which follows the workflows and
 * the code they run, cannot say what it does: a Tauri app or a Rust crate,
 * since the map reads no Rust, whether a workflow builds it or not; and the
 * files a hosting service deploys from (a Dockerfile, fly.toml, render.yaml
 * and their kin) that no workflow runs. A workflow reaches one when it runs
 * or checks a file of it, names the file, or runs the tool that builds or
 * deploys it.
 *
 * @param {Set<string>} tracked
 * @param {object[]} doors every door of the map
 * @returns {Array<{ kind: 'tauri'|'crate', dir: string, rust: number, built: boolean } | { kind: 'deploy', files: string[] }>}
 */
export function unseenParts(tracked, doors) {
  const workflows = doors.filter((door) => !door.kind && !door.parseError);
  const texts = workflows.flatMap((door) => [...(door.commands ?? []).map((command) => command.text), ...(door.uses ?? [])]);
  const says = (pattern) => texts.some((text) => pattern.test(text));
  const touches = (path) => workflows.some((door) => (door.runs ?? []).some((run) => run.path === path || (run.via ?? '').includes(path))
    || (door.mentions ?? []).some((mention) => mention.path === path));
  const runsUnder = (dir) => workflows.some((door) => (door.runs ?? []).some((run) => run.path.startsWith(`${dir}/`)));
  const paths = [...tracked].filter((path) => !isTestMaterial(path)).sort();
  const rustUnder = (dir) => paths.filter((path) => path.endsWith('.rs') && (dir === '' || path.startsWith(`${dir}/`))).length;
  const out = [];
  const apps = [];
  for (const path of paths) {
    if (!/(^|\/)tauri\.conf\.json5?$|(^|\/)Tauri\.toml$/.test(path)) continue;
    const conf = dirOf(path);
    const app = posix.basename(conf) === 'src-tauri' ? dirOf(conf) : conf;
    apps.push(conf);
    const built = says(/\btauri\b[^\n]*\bbuild\b|tauri-apps\/tauri-action/) || says(CARGO) || runsUnder(conf);
    out.push({ kind: 'tauri', dir: app, rust: rustUnder(app), built });
  }
  for (const path of paths) {
    if (posix.basename(path) !== 'Cargo.toml') continue;
    const dir = dirOf(path);
    if (apps.some((conf) => dir === conf || dir.startsWith(`${conf}/`))) continue;
    out.push({ kind: 'crate', dir, rust: rustUnder(dir), built: says(CARGO) || touches(path) });
  }
  const deploys = [];
  for (const path of paths) {
    const base = posix.basename(path);
    const tool = DEPLOY_FILES.find(([test]) => test.test(base));
    if (!tool) continue;
    if (touches(path) || says(tool[1])) continue;
    deploys.push(path);
  }
  if (deploys.length > 0) out.push({ kind: 'deploy', files: deploys });
  return out;
}

const CARGO = /\bcargo\s+(build|test|check|clippy|run|publish|install|nextest)\b|dtolnay\/rust-toolchain|actions-rs\//;

// Each file a hosting service deploys from, and what a workflow says to run
// the tool that reads it.
const DEPLOY_FILES = [
  [/^(Dockerfile(\.[\w.-]+)?|[\w.-]+\.Dockerfile)$/, /\bdocker\b[^\n]*\b(build|buildx|compose)\b|docker\/build-push-action|redhat-actions\/buildah-build|\bdocker-compose\b/],
  [/^(docker-)?compose\.ya?ml$/, /\bdocker\b[^\n]*\bcompose\b|\bdocker-compose\b/],
  [/^fly\.toml$/, /\bfly(ctl)?\s|superfly\//],
  [/^render\.ya?ml$/, /render\.com|\bRENDER_[A-Z_]*\b|render-deploy/],
  [/^vercel\.json$/, /\bvercel\b/i],
  [/^netlify\.toml$/, /\bnetlify\b/i],
  [/^railway\.(toml|json)$/, /\brailway\b/i],
  [/^Procfile$/, /\bheroku\b|\bdokku\b/i],
  [/^heroku\.yml$/, /\bheroku\b/i],
];

function dirOf(path) {
  const dir = posix.dirname(path);
  return dir === '.' ? '' : dir;
}
