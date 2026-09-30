import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { answered, CANNOT_SEE_SCHEMA, cutMarks, FACT_GROUP_SCHEMA, failed, freshnessSentences, provenance, PROVENANCE_SCHEMA } from './answer.js';
import { changesAnswer } from './changes-tool.js';
import { checkChangeAnswer } from './check-change-tool.js';
import { explainAnswer } from './explain-tool.js';
import { unplainNames } from './data.js';
import { changedFiles, checkoutState, mapHashes, stateAt } from './freshness.js';
import { blobAt, head, inHistory, REF_PATTERN, topLevel } from './git.js';
import { readCommittedMap, readSnapshotAt } from './map.js';
import { overviewAnswer } from './overview-tool.js';
import { reachAnswer } from './reach-tool.js';
import { createRefresher } from './refresh.js';
import { refreshAnswer, REFRESH_ANSWER } from './refresh-tool.js';
import { reread, rereadFacts } from './reread.js';
import { outputSchema, problems } from './schema.js';
import { SIZE_NOTE, SIZE_PROPERTIES, sizeAnswer } from './size.js';
import { testGapsAnswer } from './test-gaps-tool.js';

/**
 * The sidecar's tools. Names, titles, descriptions and schemas are static
 * strings written here; nothing read from a repository ever reaches them.
 * Every tool only reads, so every one carries the same annotations.
 */

const READ_ONLY = Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });

// How many changed files one answer reads again; a question about more is
// better answered by a refresh.
const REREAD_CAP = 20;

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

// What an answer narrowed by part or kind says it was narrowed to, and how
// many entries that did not match it leaves out.
const FILTER = {
  type: 'object',
  properties: { part: { type: 'string' }, kind: { type: 'string' }, left: { type: 'integer', minimum: 0 } },
  required: ['left'],
};

// The count and cut marks beside a list other than a fact list.
function listMarks(list) {
  return { [`${list}Total`]: { type: 'integer', minimum: 0 }, ...cutMarks(list) };
}

// Every answer: the question as asked, the facts in groups of one basis, and
// what Atlas cannot see for it; a tool adds what else it names. Any list may
// be cut to fit the answer's size, and then carries its marks.
function answerSchema(question, extra = {}) {
  const lists = Object.entries(extra).filter(([, schema]) => [schema.type].flat().includes('array')).map(([key]) => key);
  return {
    type: 'object',
    properties: {
      question,
      facts: { type: 'array', items: FACT_GROUP_SCHEMA },
      cannotSee: { type: 'array', items: CANNOT_SEE_SCHEMA },
      ...extra,
      ...listMarks('facts'),
      ...listMarks('cannotSee'),
      ...Object.assign({}, ...lists.map(listMarks)),
      filter: FILTER,
    },
    required: ['question', 'facts', 'cannotSee', ...Object.keys(extra)],
  };
}

const EXPLAIN_ANSWER = answerSchema(QUESTION_PATH, { found: FOUND });

// A test-gaps question may be about the whole repository.
const GAPS_ANSWER = answerSchema({
  type: 'object',
  properties: { path: { type: ['string', 'null'] } },
  required: ['path'],
}, {
  found: { ...FOUND, properties: { ...FOUND.properties, kind: { type: 'string', enum: ['repository', 'file', 'directory', 'part'] } } },
  suggestions: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        rule: { type: 'string', enum: ['G1', 'G2', 'G3', 'G4', 'G6'] },
        path: { type: 'string' },
        part: { type: 'string' },
        kind: { type: 'string' },
        facts: { type: 'object' },
        suggest: { type: 'object', properties: { runner: { type: 'string' }, text: { type: 'string' } }, required: ['text'] },
        source: { type: ['object', 'null'] },
      },
      required: ['rule', 'facts', 'suggest', 'source'],
    },
  },
});

// Every tool that answers from a map may be asked to answer from the map a
// ref holds, read with git, never checked out and never fetched.
const REF_ARGUMENT = {
  type: 'string',
  minLength: 1,
  maxLength: 200,
  pattern: REF_PATTERN,
  description: 'A ref this clone holds, such as origin/main, a tag or a commit: the answer comes from the Atlas map at that ref, '
    + 'and the files it names are read at that ref. Nothing is fetched. Left out, the map in the checkout answers.',
};

// atlas_check_change compares the working tree with the map, so the map a ref
// holds must be made from a commit this checkout holds.
const CHECK_REF_ARGUMENT = {
  ...REF_ARGUMENT,
  description: 'A ref this clone holds whose Atlas map was made from a commit in the history of this checkout, such as the '
    + 'default branch a feature branch started from: the working tree is compared with that map. Nothing is fetched.',
};

const DEFINED = [
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
    name: 'atlas_test_gaps',
    title: 'What no test reaches, and what should',
    description: 'What no test imports or runs in this repository, a part, a directory or a file, from its Atlas map, and '
      + 'what should reach it: the test runs CI makes and the runner behind each, which parts and files tests reach and how, '
      + 'the code gaps ranked (on a shipping door\'s path, then fan-in, changes and failure paths; five shown with a count '
      + 'of the rest), and apart the test files no workflow runs, coverage not collected and installed commands nothing runs. '
      + 'Facts come first; each suggestion after them names its rule, the facts that triggered it and the source of what it '
      + 'suggests. Reach is not proof a test exercises a file. Give a path from the repository root or a part name, or none '
      + 'for the whole repository.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          minLength: 1,
          maxLength: 1024,
          description: 'A file or directory, from the repository root, or the name of a part; left out, the whole repository.',
        },
      },
      additionalProperties: false,
    },
    outputSchema: outputSchema(PROVENANCE_SCHEMA, GAPS_ANSWER),
    answer: (snapshot, repo, args) => testGapsAnswer(snapshot, repo, args.path),
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
          pattern: REF_PATTERN,
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
  {
    name: 'atlas_check_change',
    title: 'Check a change against the map',
    description: 'What a change does before it is committed, from the Atlas map and a re-read of only the changed files: '
      + 'the tests that reach them, the doors that run them or pass through their parts, the imports between parts '
      + 'gained or lost, files in no part, writers and readers gained or lost, and whether the map must be regenerated '
      + 'before commit. A change to a manifest, a workflow, a configuration file the engine reads or the boundary file, '
      + 'or a deleted file, gets "a full refresh is needed" and no partial answer. Give the changed files, or none to '
      + 'take every file that differs from the map.',
    inputSchema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          minItems: 1,
          maxItems: 200,
          items: { type: 'string', minLength: 1, maxLength: 1024 },
          description: 'The changed files, from the repository root; left out, every file that differs from the map.',
        },
      },
      additionalProperties: false,
    },
    outputSchema: outputSchema(PROVENANCE_SCHEMA, answerSchema({
      type: 'object',
      properties: { files: { type: ['array', 'null'], items: { type: 'string' } }, from: { type: 'string', enum: ['given', 'checkout'] } },
      required: ['files', 'from'],
    }, {
      changed: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            status: { type: 'string', enum: ['modified', 'added', 'deleted', 'untracked', 'unmerged', 'unchanged'] },
            committed: { type: 'boolean' },
            uncommitted: { type: 'boolean' },
            part: { type: ['string', 'null'] },
          },
          required: ['path', 'status', 'committed', 'uncommitted', 'part'],
        },
      },
      verdict: {
        type: 'object',
        properties: {
          fullRefresh: {
            type: 'object',
            properties: { needed: { type: 'boolean' }, because: { type: 'array' } },
            required: ['needed', 'because'],
          },
          regenerate: {
            type: 'object',
            properties: { needed: { type: 'boolean' }, because: { type: 'array', items: { type: 'string' } }, alsoStale: { type: 'array', items: { type: 'string' } } },
            required: ['needed', 'because'],
          },
        },
        required: ['fullRefresh', 'regenerate'],
      },
    })),
    // It reads the changed files again itself, as they are and as the map
    // read them; the generic re-read beside the map's view would repeat it.
    rereadsItself: true,
    // It compares the working tree with the map, whatever map answers.
    readsTree: true,
    answer: (snapshot, repo, args) => checkChangeAnswer(snapshot, repo, args),
  },
  {
    name: 'atlas_refresh',
    title: 'Map the checkout again',
    description: 'Maps this checkout again with this Atlas engine, in the background, into a cache outside the repository; '
      + 'the repository is never written. The first call starts the map; later calls report its progress, then that it '
      + 'finished. Answers keep using the map they had until the new one is swapped in whole, and every answer names '
      + 'the map it used.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    outputSchema: outputSchema(PROVENANCE_SCHEMA, REFRESH_ANSWER),
    refresh: true,
  },
];

// Every tool that answers from a map takes the size arguments (full, part,
// kind, cursor) and says in its description how its answers are cut.
// Every tool but the refresh also takes a ref to answer from.
const TOOLS = DEFINED.map((tool) => (tool.refresh ? tool : {
  ...tool,
  description: `${tool.description}${SIZE_NOTE}`,
  inputSchema: { ...tool.inputSchema, properties: { ...tool.inputSchema.properties, ref: tool.readsTree ? CHECK_REF_ARGUMENT : REF_ARGUMENT, ...SIZE_PROPERTIES } },
}));

// The order the specification lists the questions in, by how often the
// evidence says each is asked: reachability first.
const ORDER = ['atlas_reach', 'atlas_explain', 'atlas_overview', 'atlas_check_change', 'atlas_test_gaps', 'atlas_changes', 'atlas_refresh'];

/**
 * The tools of one server process, with the refresher whose snapshots they
 * answer from.
 *
 * @param {{ refresher?: ReturnType<typeof createRefresher> }} [options]
 */
export function createTools({ refresher = createRefresher() } = {}) {
  /** The tools as tools/list gives them, in a fixed order. */
  function listTools() {
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
   * The snapshot one answer is read from, chosen once: the newest refresh of
   * this checkout that its history holds and the committed map does not
   * postdate, else the committed map.
   */
  function snapshotFor(repo) {
    const committed = readCommittedMap(repo.root);
    const refreshed = refresher.snapshotFor(repo.root, committed.ok ? committed.snapshot.commit : null);
    if (refreshed) return { ok: true, snapshot: refreshed };
    return committed;
  }

  /**
   * @param {string} name a tool listTools names
   * @param {unknown} args the call's arguments
   * @param {{ roots: string[], cwd: string }} context
   * @returns {Promise<object>} the tool result: one text block and the structured content
   */
  async function callTool(name, args, context) {
    const tool = TOOLS.find((entry) => entry.name === name);
    const invalid = problems(tool.inputSchema, args);
    if (invalid.length > 0) {
      return failed(provenance(), { code: 'ATLAS_SIDECAR_INVALID_ARGUMENTS', details: invalid.slice(0, 8), whatToDo: `call ${name} with the arguments its input schema names` });
    }
    const repo = repositoryFor(context);
    if (repo.error) return failed(provenance(), repo.error);
    const ref = tool.refresh ? null : args.ref ?? null;
    const read = ref ? readSnapshotAt(repo.root, ref) : snapshotFor(repo);
    if (tool.refresh) return refreshAnswer(refresher, repo, read.ok ? read.snapshot : null);
    if (!read.ok) return failed(provenance({ repo, head: head(repo.root) }), read.error);
    const { snapshot } = read;
    if (ref && tool.readsTree) {
      // The working tree is compared with the map at the ref only when the
      // checkout holds the commit that map was made from; otherwise what
      // differs would mix this change with the commits the checkout lacks.
      if (!inHistory(repo.root, snapshot.commit)) {
        return failed(provenance({ repo, snapshot, head: head(repo.root) }), {
          code: 'ATLAS_SIDECAR_MAP_FOREIGN',
          details: [`${snapshot.label} was made from ${snapshot.commit.slice(0, 7)}, which is not in this checkout's history, and ${name} compares this checkout's working tree with the map`],
          whatToDo: `ask ${name} without ref after atlas_refresh, or with a ref whose map was made from a commit this checkout holds; the other tools answer from ${ref} as it is`,
        });
      }
      snapshot.ref.treeCompared = true;
    }
    const state = ref && !tool.readsTree ? stateAt(repo.root, snapshot.commit, snapshot.ref.commit) : checkoutState(repo.root, snapshot.commit);
    const result = tool.answer(snapshot, repo, args);
    if (!result.ok) return failed(provenance({ repo, snapshot, head: state.head }), result.error, unplainNames(snapshot));
    const known = mapHashes(snapshot.structure);
    const files = [...result.files, ...pathsIn(result.answer, known)];
    const changed = changedFiles(repo.root, snapshot, state, files);
    const sentences = [...freshnessSentences(snapshot, changed), ...result.sentences];
    // A file asked about that changed after the map is read again, and what
    // it does now is set beside what the map says it did.
    const asked = new Set(tool.rereadsItself ? [] : result.files);
    // At a ref, a file is read as the ref holds it.
    const present = (path) => (state.at ? blobAt(repo.root, state.at, path) != null : existsSync(join(repo.root, path)));
    const rereadable = changed.map((entry) => entry.path).filter((path) => asked.has(path) && present(path)).slice(0, REREAD_CAP);
    if (rereadable.length > 0) {
      for (const reading of reread(snapshot, repo, rereadable, { at: state.at ?? null })) {
        const view = rereadFacts(snapshot, reading);
        result.answer.facts.push(...view.facts);
        result.answer.cannotSee.push(...view.cannotSee);
        sentences.push(view.sentence);
      }
    }
    // The names the text quotes as data, taken before any list is cut, so a
    // name a sentence keeps is quoted though its entry was cut.
    const names = unplainNames(snapshot, result.answer);
    // Narrowed as asked, most important first, and cut to its size.
    const sized = sizeAnswer({ tool: name, snapshot, args, atlas: provenance({ repo, snapshot, head: state.head, changed }), answer: result.answer, sentences, names });
    if (sized.error) return failed(provenance({ repo, snapshot, head: state.head }), sized.error, names);
    return answered(sized.atlas, sized.answer, sized.sentences, names);
  }

  return { listTools, callTool, stop: () => refresher.stopAll() };
}

const shared = createTools();

/** The tools of this process, as the server lists them. */
export const listTools = shared.listTools;
/** A call to one of this process's tools. */
export const callTool = shared.callTool;
/** Stops a refresh still running when the server's input closes. */
export const stopTools = shared.stop;

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
