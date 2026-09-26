import { languageOf } from '../core/languages.js';
import { isTestFile } from '../core/landings.js';

/**
 * The kind of code each part is, which decides the test runner a suggestion
 * names (docs/atlas-test-gaps.spec.md, "Kind of code"). Each part gets
 * exactly one, from its language and manifests, the most specific winning:
 * an MCP server over a Node library, a Tauri app over a TypeScript monorepo.
 * Every answer names the kind it used, so a disputed suggestion can be traced
 * to this decision.
 *
 * A part whose role is not code gets a kind only when it is data or a site;
 * documentation, configuration and test parts get none.
 */

export const KIND_LABELS = {
  'vscode-extension': 'VS Code extension',
  'tauri-app': 'Tauri desktop app',
  'godot-game': 'Godot game',
  'mcp-server': 'MCP server',
  rust: 'Rust crate or CLI',
  python: 'Python library or CLI',
  'ts-monorepo': 'TypeScript monorepo',
  node: 'Node/TypeScript library or CLI',
  data: 'Data or asset pack',
  site: 'Static site',
};

const SCRIPT = new Set(['javascript', 'typescript', 'tsx']);

/**
 * @param {object} structure a map, as structure.json holds it
 * @returns {Map<string, { kind: string, label: string }>} by part name
 */
export function kindsOf(structure) {
  const out = new Map();
  const desktop = (structure.doors ?? []).some((door) => door.app === 'desktop');
  const members = structure.workspaces ?? [];
  for (const boundary of structure.boundaries ?? []) {
    const kind = kindOf(boundary, structure.doors ?? [], { desktop, members });
    if (kind) out.set(boundary.name, { kind, label: KIND_LABELS[kind] });
  }
  return out;
}

function kindOf(boundary, doors, { desktop, members }) {
  if (boundary.role === 'data') return 'data';
  if (boundary.role === 'site') return 'site';
  if (boundary.role !== 'code') return null;
  const files = (boundary.files ?? []).map((file) => file.path);
  const holds = (path) => files.includes(path);
  const used = new Set(boundary.frameworks ?? []);
  const language = dominantLanguage(files);
  const script = SCRIPT.has(language);
  // An extension's code imports the VS Code API, and a root manifest that
  // declares it marks its package door.
  if (used.has('vscode') || doors.some((door) => door.extension && holds(door.file))) return 'vscode-extension';
  // A Tauri app is its Rust half and the web half beside it: every script
  // or Rust part of a repository that ships a desktop app, and a part that
  // imports Tauri's API or holds its configuration.
  if (used.has('tauri') || files.some((path) => /(^|\/)tauri\.conf\.json5?$/.test(path)) || (desktop && (script || language === 'rust'))) return 'tauri-app';
  if (language === 'gdscript' || files.some((path) => /(^|\/)project\.godot$/.test(path))) return 'godot-game';
  if (used.has('mcp')) return 'mcp-server';
  if (language === 'rust') return 'rust';
  if (language === 'python') return 'python';
  if (script) return members.some((dir) => files.some((path) => path.startsWith(`${dir}/`))) ? 'ts-monorepo' : 'node';
  return null;
}

// The language most of a part's code files are in, tests left out; a tie
// goes to the language first in alphabetical order.
export function dominantLanguage(files) {
  const counts = new Map();
  for (const path of files) {
    if (isTestFile(path)) continue;
    const language = languageOf(path);
    if (language == null) continue;
    counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  let best = null;
  for (const [language, count] of [...counts].sort((a, b) => (a[0] < b[0] ? -1 : 1))) if (best == null || count > counts.get(best)) best = language;
  return best;
}
