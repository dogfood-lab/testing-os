import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { isTestMaterial } from './landings.js';
import { storedText } from './text.js';

/**
 * The Godot projects a repository holds, read from each tracked
 * project.godot the way the engine reads it: the directory the file is in is
 * the project's root, the one res:// names; [application] run/main_scene is
 * the scene the game starts; each [autoload] entry is a script or scene the
 * engine loads before any scene, under the name code reaches it by. An
 * export_presets.cfg beside it names the presets a release is exported with,
 * each for a platform. Every path is tracked: the engine's own .godot/ cache
 * is not, so the reading is the same with and without it.
 */

const CACHE = new WeakMap();

/**
 * @param {string} repoPath
 * @param {Set<string>} tracked
 * @returns {Array<{ file: string, dir: string, name: string | null, mainScene: string | null, autoloads: Array<{ name: string, path: string }>, presets: Array<{ name: string, platform: string | null }> }>}
 */
export function godotProjects(repoPath, tracked) {
  if (CACHE.has(tracked)) return CACHE.get(tracked);
  const read = (path) => {
    try {
      return storedText(readFileSync(join(repoPath, path), 'utf8'));
    } catch {
      return '';
    }
  };
  const projects = [...tracked]
    .filter((path) => posix.basename(path) === 'project.godot' && !isTestMaterial(path))
    .sort()
    .map((file) => {
      const dir = posix.dirname(file) === '.' ? '' : posix.dirname(file);
      const sections = parseIni(read(file));
      const project = { file, dir };
      const res = (value) => resPath(project, unquote(value ?? ''), tracked);
      const application = sections.get('application') ?? new Map();
      const autoloads = [];
      for (const [name, value] of sections.get('autoload') ?? new Map()) {
        const path = res(unquote(value).replace(/^\*/, ''));
        if (path) autoloads.push({ name, path });
      }
      const presetsFile = dir ? `${dir}/export_presets.cfg` : 'export_presets.cfg';
      const presets = [];
      if (tracked.has(presetsFile)) {
        for (const [section, keys] of parseIni(read(presetsFile))) {
          if (!/^preset\.\d+$/.test(section) || !keys.has('name')) continue;
          presets.push({ name: unquote(keys.get('name')), platform: keys.has('platform') ? unquote(keys.get('platform')) : null });
        }
      }
      return {
        file,
        dir,
        name: application.has('config/name') ? unquote(application.get('config/name')) : null,
        mainScene: application.has('run/main_scene') ? res(application.get('run/main_scene')) : null,
        autoloads,
        presets,
      };
    });
  CACHE.set(tracked, projects);
  return projects;
}

/**
 * The project a file is in: the one whose root is the deepest holding it.
 *
 * @param {Array<{ dir: string }>} projects
 * @param {string} path
 */
export function projectOf(projects, path) {
  let best = null;
  for (const project of projects) {
    if (project.dir !== '' && !path.startsWith(`${project.dir}/`)) continue;
    if (best == null || project.dir.length > best.dir.length) best = project;
  }
  return best;
}

/**
 * The tracked path a res:// path names in a project, or null: res://a/b is
 * a/b under the project's root. A path the repository does not track names
 * nothing here.
 *
 * @param {{ dir: string }} project
 * @param {string} text
 * @param {Set<string>} tracked
 */
export function resPath(project, text, tracked) {
  if (project == null || !text.startsWith('res://')) return null;
  const rest = posix.normalize(text.slice('res://'.length) || '.');
  if (rest === '..' || rest.startsWith('../') || rest.startsWith('/')) return null;
  const path = project.dir ? (rest === '.' ? project.dir : `${project.dir}/${rest}`) : rest;
  return tracked.has(path) ? path : null;
}

/**
 * Godot's configuration files (project.godot, export_presets.cfg, and the
 * header lines of a scene or resource) as sections of keys and their raw
 * values. A value opening a bracket, brace or parenthesis runs until they
 * close, across lines, as an input map's dictionary does; ; starts a comment
 * outside a string.
 *
 * @param {string} text
 * @returns {Map<string, Map<string, string>>}
 */
export function parseIni(text) {
  const sections = new Map([['', new Map()]]);
  let current = sections.get('');
  let pending = null;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    if (pending) {
      pending.value += `\n${raw}`;
      if (depthOf(pending.value) <= 0) {
        current.set(pending.key, pending.value.trim());
        pending = null;
      }
      continue;
    }
    const line = withoutComment(raw).trim();
    if (line === '') continue;
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      if (!sections.has(header[1])) sections.set(header[1], new Map());
      current = sections.get(header[1]);
      continue;
    }
    const at = line.indexOf('=');
    if (at <= 0) continue;
    const key = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim();
    if (depthOf(value) > 0) pending = { key, value };
    else current.set(key, value);
  }
  return sections;
}

function withoutComment(line) {
  let quote = false;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"' && line[i - 1] !== '\\') quote = !quote;
    else if (!quote && line[i] === ';') return line.slice(0, i);
  }
  return line;
}

function depthOf(text) {
  let depth = 0;
  let quote = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' && text[i - 1] !== '\\') quote = !quote;
    else if (!quote && '([{'.includes(ch)) depth += 1;
    else if (!quote && ')]}'.includes(ch)) depth -= 1;
  }
  return depth;
}

/**
 * A quoted value's text; any other value as it is written.
 *
 * @param {string} value
 */
export function unquote(value) {
  const text = String(value).trim();
  return /^"(?:[^"\\]|\\.)*"$/.test(text) ? text.slice(1, -1).replace(/\\(.)/g, '$1') : text;
}
