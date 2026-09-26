/**
 * The runner a suggestion names for each kind of code, and where it comes
 * from, in the Director's order (2026-09-26): the house standard where one
 * exists, naming its file; otherwise fleet practice, naming how many
 * repositories of the kind do it; otherwise the framework's documentation.
 * The fleet counts are the coordinator's survey of the 79 repositories on the
 * published fleet page, ground-truthed against manifests and CI, and are
 * stated with that date (docs/atlas-test-gaps.spec.md, "The source table").
 */

export const FLEET_SURVEY = '2026-09-26';

const TABLE = {
  node: {
    runner: 'Vitest for TypeScript, node --test for plain-JS packages',
    fleet: { practice: 'Vitest in 14 and node --test in 7', of: '25 Node and TypeScript library or CLI repositories' },
  },
  'mcp-server': {
    runner: 'Vitest for a Node server, pytest for a Python one',
    fleet: { practice: 'Vitest in 12 and pytest in 2', of: '14 MCP server repositories' },
  },
  python: {
    runner: 'pytest with pytest-cov',
    fleet: { practice: 'pytest in 17', of: '18 Python repositories' },
  },
  'ts-monorepo': {
    runner: 'Vitest at the root, and Playwright end to end where there is a UI',
    fleet: { practice: 'Vitest in 6 and node --test in 3', of: '9 TypeScript monorepos' },
  },
  'tauri-app': {
    runner: 'Vitest (front end) and cargo test (Rust)',
    house: { rule: 'desktop apps verify with cargo check, tsc --noEmit and vitest run', file: 'E:/AI/.claude/CLAUDE.md' },
    fleet: { practice: 'Vitest in 4 and cargo test in 3', of: '5 Tauri desktop apps' },
  },
  rust: {
    runner: 'cargo test',
    fleet: { practice: 'cargo test in 2', of: '2 Rust crate or CLI repositories' },
  },
  'vscode-extension': {
    runner: 'Vitest for units, and @vscode/test-cli for the extension host',
    external: "Microsoft's extension testing guide, which runs the extension host with @vscode/test-cli and @vscode/test-electron",
  },
  'godot-game': {
    runner: "the repository's own runner; gdUnit4 is the reference for a new Godot project",
    fleet: { practice: 'its own headless runner, chosen deliberately, in 1', of: '1 Godot game' },
  },
  data: {
    runner: 'pytest as a manifest and schema validator',
    fleet: { practice: 'pytest as a validator in 1', of: '1 data or asset pack' },
  },
};

// testing-os's own rule is this repository's, not the studio's, so it is
// cited for testing-os alone.
const OWN_RULES = {
  'dogfood-lab/testing-os': { kinds: ['node', 'ts-monorepo'], runner: 'node --test for JavaScript packages, Vitest for TypeScript', rule: 'JS packages use node --test; the TS schemas package uses Vitest', file: 'CLAUDE.md' },
};

/**
 * The runner to suggest for a kind of code, with its source, or null for a
 * kind Atlas suggests none for today (a static site).
 *
 * @param {string} kind a kind from adapter/test-kinds.js
 * @param {{ repository?: string | null }} [options] the repository, owner/name
 */
export function runnerFor(kind, { repository = null } = {}) {
  const own = repository != null ? OWN_RULES[repository] : null;
  if (own?.kinds.includes(kind)) return { runner: own.runner, source: { from: 'house', text: `${own.rule} (${own.file})`, file: own.file } };
  const row = TABLE[kind];
  if (!row) return null;
  if (row.house) return { runner: row.runner, source: { from: 'house', text: `${row.house.rule} (${row.house.file})`, file: row.house.file } };
  if (row.fleet) return { runner: row.runner, source: { from: 'fleet', text: `${row.fleet.practice} of ${row.fleet.of} on the fleet page (fleet survey of ${FLEET_SURVEY})` } };
  return { runner: row.runner, source: { from: 'external', text: row.external } };
}

/**
 * The studio's coverage recipe, the house standard G4 cites: a coverage
 * dependency, a coverage step in CI, a Codecov upload and a README badge,
 * with thresholds held as ratchets to the current figure.
 */
export const COVERAGE_RECIPE = {
  steps: 'a coverage dependency, a coverage step in CI, a Codecov upload and a README badge, with any threshold a ratchet to the current figure',
  source: { from: 'house', text: 'the Full Treatment, Phase 4' },
};

/**
 * The coverage tool each runner collects with, for G4's suggestion.
 */
export const COVERAGE_TOOLS = {
  vitest: '@vitest/coverage-v8, with vitest run --coverage',
  jest: 'jest --coverage',
  mocha: 'c8 around mocha',
  'node --test': 'c8 around node --test',
  node: 'c8 around node',
  pytest: 'pytest-cov, with pytest --cov',
  unittest: 'coverage run -m unittest',
  python: 'coverage run',
  'cargo test': 'cargo llvm-cov',
  'cargo nextest': 'cargo llvm-cov nextest',
  'deno test': 'deno test --coverage',
  'bun test': 'bun test --coverage',
  'dotnet test': 'dotnet test --collect "XPlat Code Coverage"',
};

/**
 * The shipcheck gate G3 cites: hard gate D1 wants a verify script covering
 * test, build and smoke. Atlas does not re-audit what shipcheck gates; it
 * cites it where a suggestion touches it.
 */
export const SMOKE_GATE = { from: 'house', text: 'shipcheck hard gate D1: a verify script covering test, build and smoke' };
