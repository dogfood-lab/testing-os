import { answered, CANNOT_SEE_SCHEMA, FACT_GROUP_SCHEMA, failed, provenance, PROVENANCE_SCHEMA } from './answer.js';
import { changesAnswer } from './changes-tool.js';
import { explainAnswer } from './explain-tool.js';
import { changedFiles, checkoutState, mapHashes } from './freshness.js';
import { head, topLevel } from './git.js';
import { readCommittedMap } from './map.js';
import { overviewAnswer } from './overview-tool.js';
import { reachAnswer } from './reach-tool.js';
import { outputSchema, problems } from './schema.js';

/**
 * The sidecar's tools. Names, titles, descriptions and schemas are static
 * strings written here; nothing read from a repository ever reaches them.
 * Every tool only reads, so every one carries the same annotations.
 */

const READ_ONLY = Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });

const QUESTION_PATH = {
  type: 'object',
  properties: { path: { type: 'string' } },
  required: ['path'],
};

const FOUND = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['file', 'directory', 'part'] },
    path: { type: ['string', 'null'] },
    part: { type: ['string', 'null'] },
  },
  required: ['kind', 'path', 'part'],
};

// Every answer: the question as asked, the facts in groups of one basis, and
// what Atlas cannot see for it; a tool adds what else it names.
function answerSchema(question, extra = {}) {
  return {
    type: 'object',
    properties: {
      question,
      facts: { type: 'array', items: FACT_GROUP_SCHEMA },
      cannotSee: { type: 'array', items: CANNOT_SEE_SCHEMA },
      ...extra,
    },
    required: ['question', 'facts', 'cannotSee', ...Object.keys(extra)],
  };
}

const EXPLAIN_ANSWER = answerSchema(QUESTION_PATH, { found: FOUND });

// A ref git reads: a commit, a branch, a tag, HEAD~3; never an option.
const REF = '^[A-Za-z0-9._/~^@{}][A-Za-z0-9._/~^@{}-]*$';

const TOOLS = [
  {
    name: 'atlas_explain',
    title: 'Explain a file, directory or part',
    description: 'What one file, directory or part of this repository is, from its Atlas map: the part it is in and its role, '
      + 'the doors that run it or pass through its part, what it imports and what imports it, what it writes and who reads that, '
      + 'who writes it and who reads it when it is a place, the order of work inside it, and what it changes with. '
      + 'Every fact says how it was known, and the answer lists what Atlas cannot see for it. '
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
    outputSchema: outputSchema(PROVENANCE_SCHEMA, EXPLAIN_ANSWER),
    answer: (snapshot, repo, args) => {
      const result = explainAnswer(snapshot, repo, args.path);
      if (!result.ok) return result;
      return {
        ok: true,
        answer: { question: { path: args.path }, found: result.found, facts: result.facts, cannotSee: result.cannotSee },
        sentences: result.sentences,
        files: result.files,
      };
    },
  },
  {
    name: 'atlas_overview',
    title: 'Overview of the repository',
    description: 'What this repository is, from its Atlas map: its parts, every door work comes in by (its trigger, '
      + 'what it runs and what it sends), how far each door reaches, the main flow and the order of work in it, '
      + 'and where to start reading. Every fact says how it was known, and the answer lists what Atlas cannot see.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    outputSchema: outputSchema(PROVENANCE_SCHEMA, answerSchema({ type: 'object' })),
    answer: (snapshot) => overviewAnswer(snapshot),
  },
  {
    name: 'atlas_reach',
    title: 'What a change to these files reaches',
    description: 'What a change to these files reaches, from the Atlas map: the doors that run them or pass through their part, '
      + 'the files and parts that import them or read what they write (production and tests apart), followed as far as '
      + 'the code says; what is known only by text, a guess or history is listed one step out and not followed, and '
      + 'where the map stops is listed with what Atlas cannot see.',
    inputSchema: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: { type: 'string', minLength: 1, maxLength: 1024 },
          description: 'Files or directories, from the repository root.',
        },
      },
      required: ['paths'],
      additionalProperties: false,
    },
    outputSchema: outputSchema(PROVENANCE_SCHEMA, answerSchema({
      type: 'object',
      properties: { paths: { type: 'array', items: { type: 'string' } } },
      required: ['paths'],
    })),
    answer: (snapshot, repo, args) => reachAnswer(snapshot, args.paths),
  },
  {
    name: 'atlas_changes',
    title: 'What changed structurally since a commit',
    description: 'What changed structurally between the Atlas map committed at a commit and the map Atlas answers from: '
      + 'imports between parts gained or lost (a new cycle first), doors, new writers and readers of places, origins, '
      + 'the order of work, parts, and new files in no part, with the file counts.',
    inputSchema: {
      type: 'object',
      properties: {
        since: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
          pattern: REF,
          description: 'A commit or ref whose tree holds an Atlas map, such as the base of a pull request.',
        },
      },
      required: ['since'],
      additionalProperties: false,
    },
    outputSchema: outputSchema(PROVENANCE_SCHEMA, answerSchema({
      type: 'object',
      properties: { since: { type: 'string' } },
      required: ['since'],
    }, { base: { type: 'object', properties: { commit: { type: 'string' } }, required: ['commit'] } })),
    answer: (snapshot, repo, args) => changesAnswer(snapshot, repo, args.since),
  },
];

// The order the specification lists the questions in, by how often the
// evidence says each is asked: reachability first.
const ORDER = ['atlas_reach', 'atlas_explain', 'atlas_overview', 'atlas_check_change', 'atlas_changes', 'atlas_refresh'];

/** The tools as tools/list gives them, in a fixed order. */
export function listTools() {
  return [...TOOLS].sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name)).map((tool) => ({
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
    return failed(provenance(), { code: 'ATLAS_SIDECAR_INVALID_ARGUMENTS', details: invalid.slice(0, 8), whatToDo: `call ${name} with the arguments its input schema names` });
  }
  const repo = repositoryFor(context);
  if (repo.error) return failed(provenance(), repo.error);
  const read = readCommittedMap(repo.root);
  if (!read.ok) return failed(provenance({ repo, head: head(repo.root) }), read.error);
  const { snapshot } = read;
  const state = checkoutState(repo.root, snapshot.commit);
  const result = tool.answer(snapshot, repo, args);
  if (!result.ok) return failed(provenance({ repo, snapshot, head: state.head }), result.error);
  const known = mapHashes(snapshot.structure);
  const files = [...result.files, ...pathsIn(result.answer, known)];
  const changed = changedFiles(repo.root, snapshot, state, files);
  return answered(provenance({ repo, snapshot, head: state.head, changed }), result.answer, result.sentences);
}

// Every tracked path an answer's facts name, in the order they appear, so
// the provenance can say which of them changed after the map.
function pathsIn(answer, known) {
  const dirs = new Set();
  for (const file of known.keys()) for (let at = file.indexOf('/'); at !== -1; at = file.indexOf('/', at + 1)) dirs.add(file.slice(0, at));
  const out = [];
  const visit = (value) => {
    if (typeof value === 'string') {
      const path = value.endsWith('/') ? value.slice(0, -1) : value;
      if (known.has(path) || dirs.has(path)) out.push(path);
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') for (const key of ['by', 'path', 'file', 'place', 'a', 'b']) if (key in value) visit(value[key]);
  };
  for (const factGroup of answer.facts ?? []) visit(factGroup.items);
  return out;
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
