import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENGINE } from '../adapter/engine.js';
import { ERRORS } from '../adapter/errors.js';
import { explainTarget } from '../adapter/explain.js';
import { topLevel } from './git.js';
import { outputSchema, problems } from './schema.js';

/**
 * The sidecar's tools. Names, titles, descriptions and schemas are static
 * strings written here; nothing read from a repository ever reaches them.
 * Every tool only reads, so every one carries the same annotations.
 */

const READ_ONLY = Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });

const PROVENANCE = {
  type: 'object',
  properties: {
    engine: { type: 'string' },
    line: { type: 'string' },
  },
  required: ['engine', 'line'],
};

const TOOLS = [
  {
    name: 'atlas_explain',
    title: 'Explain a file, directory or part',
    description: 'What one file, directory or part of this repository is, from its Atlas map: the part it is in and its role, '
      + 'the doors that run it or pass through its part, what it imports and what imports it, what it writes and who reads that, '
      + 'who writes it and who reads it when it is a place, the order of work inside it, and what it changes with. '
      + 'Give a path from the repository root, or a part name from atlas/boundaries.yaml.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          minLength: 1,
          maxLength: 1024,
          description: 'A file or directory, from the repository root, or the name of a part.',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
    outputSchema: outputSchema(PROVENANCE, { type: 'object' }),
    run: explain,
  },
];

/** The tools as tools/list gives them. */
export function listTools() {
  return TOOLS.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    annotations: { title: tool.title, ...READ_ONLY },
  }));
}

/**
 * @param {string} name a tool listTools names
 * @param {unknown} args the call's arguments
 * @param {{ roots: string[], cwd: string }} context
 * @returns {Promise<object>} the tool result: one text block and the structured content
 */
export async function callTool(name, args, context) {
  const tool = TOOLS.find((entry) => entry.name === name);
  const invalid = problems(tool.inputSchema, args);
  if (invalid.length > 0) {
    return failure({ code: 'ATLAS_SIDECAR_INVALID_ARGUMENTS', details: invalid.slice(0, 8), whatToDo: `call ${name} with the arguments its input schema names` });
  }
  const repo = repositoryFor(context);
  if (repo.error) return failure(repo.error);
  return tool.run(args, repo);
}

// The repository an answer is about: the first client root inside one, else
// the working directory's, each resolved to the top of its working tree.
function repositoryFor({ roots = [], cwd }) {
  for (const dir of roots) {
    const root = topLevel(dir);
    if (root) return { root, from: 'client root' };
  }
  const root = topLevel(cwd);
  if (root) return { root, from: 'working directory' };
  return {
    error: {
      code: 'ATLAS_SIDECAR_NOT_A_REPOSITORY',
      details: [roots.length > 0 ? 'no client root and not the working directory is inside a git repository' : 'the working directory is not inside a git repository'],
      whatToDo: 'start atlas mcp in the repository to answer for, or offer it as a root',
    },
  };
}

function readJson(path) {
  if (!existsSync(path)) return { absent: true };
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')) };
  } catch {
    return { invalid: true };
  }
}

function readMap(root) {
  const structure = readJson(join(root, 'atlas', 'structure.json'));
  if (structure.absent) {
    return { error: { code: 'ATLAS_SIDECAR_NO_MAP', details: ['atlas/structure.json is absent'], whatToDo: 'run atlas init, then atlas map, and commit atlas/' } };
  }
  if (structure.invalid) {
    return { error: { code: 'ATLAS_SIDECAR_MAP_UNREADABLE', details: ['atlas/structure.json is not valid JSON'], whatToDo: 'run atlas map and commit atlas/' } };
  }
  return {
    structure: structure.value,
    statistics: readJson(join(root, 'atlas', 'statistics.json')).value ?? {},
    page: readJson(join(root, 'atlas', 'page.json')).value ?? null,
  };
}

function explain(args, repo) {
  const map = readMap(repo.root);
  if (map.error) return failure(map.error);
  const answer = explainTarget(map, { repo: repo.root, target: args.path });
  if (!answer.ok) return failure(answer);
  return success(answer.facts, [`Atlas: ${answer.lines[0]}`, ...answer.lines.slice(1)]);
}

function provenance() {
  return { engine: ENGINE, line: `Atlas ${ENGINE}` };
}

function success(answer, lines) {
  const atlas = provenance();
  return {
    content: [{ type: 'text', text: [atlas.line, ...lines].join('\n') }],
    structuredContent: { atlas, answer },
  };
}

function failure({ code, details, whatToDo }) {
  const atlas = provenance();
  const error = { code, sentence: ERRORS[code], whatChanged: [...details], whatToDo };
  const text = [
    atlas.line,
    `Atlas cannot answer: ${error.sentence} (${code})`,
    `What changed: ${error.whatChanged.join('; ') || 'nothing listed'}.`,
    `What to do: ${whatToDo}.`,
  ].join('\n');
  return { content: [{ type: 'text', text }], structuredContent: { atlas, error }, isError: true };
}
