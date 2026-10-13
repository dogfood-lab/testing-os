/**
 * dotnet.js — .NET verification adapter.
 *
 * Probe: a solution or a *Tests.csproj. Commands: `dotnet test` on each
 * test project, chained in one step so the VSTest summaries share a stream.
 * A WinUI app project is not built. `dotnet publish` of an MSIX app is a
 * different host (MSBuild with Appx targets) and is not this gate.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { runSteps } from '../runner.js';

const SKIP_DIRS = new Set(['bin', 'obj', 'node_modules', '.git', '.swarm', 'AppPackages']);

function findFiles(dir, pred, depth, acc, cap) {
  if (depth < 0 || acc.length >= cap) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (acc.length >= cap) return;
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      findFiles(full, pred, depth - 1, acc, cap);
    } else if (ent.isFile() && pred(full)) {
      acc.push(full);
    }
  }
}

function toRel(repoPath, abs) {
  return relative(repoPath, abs).replace(/\\/g, '/');
}

// A *Tests.csproj that is an executable is a harness (a soak runner), not a
// suite. `dotnet test` on it would start that program.
function isExeProject(file) {
  try {
    const text = readFileSync(file, 'utf8');
    return /<OutputType>\s*Exe\s*<\/OutputType>/i.test(text);
  } catch {
    return true;
  }
}

function probe(repoPath) {
  const evidence = {};
  let score = 0;

  const slns = [];
  findFiles(repoPath, (full) => full.endsWith('.sln'), 0, slns, 5);
  if (slns.length > 0) {
    score += 60;
    evidence.solution = toRel(repoPath, slns[0]);
  }

  const tests = [];
  findFiles(repoPath, (full) => /Tests?\.csproj$/i.test(full) && !isExeProject(full), 4, tests, 30);
  if (tests.length > 0) {
    score += 30;
    evidence.testProjects = tests.map((p) => toRel(repoPath, p)).sort();
  }

  const reason = score > 0
    ? `.NET project (${evidence.solution || 'no solution'}, ${evidence.testProjects?.length || 0} test project(s))`
    : 'No solution or test project found';

  return { score: Math.min(score, 100), reason, evidence };
}

function commands(overrides = {}, evidence = {}) {
  if (overrides.test) return [overrides.test];

  const projects = evidence.testProjects || [];
  let args;
  if (projects.length > 0) {
    args = ['test', projects[0], '-c', 'Debug', '--nologo', '--verbosity', 'minimal'];
    for (const project of projects.slice(1)) {
      args.push('&&', 'dotnet', 'test', project, '-c', 'Debug', '--nologo', '--verbosity', 'minimal');
    }
  } else if (evidence.solution) {
    args = ['test', evidence.solution, '-c', 'Debug', '--nologo', '--verbosity', 'minimal'];
  } else {
    return [];
  }

  return [{
    name: 'test',
    cmd: 'dotnet',
    args,
    // A cold restore plus three library suites can pass 5 minutes.
    timeoutMs: 900000,
  }];
}

function run(repoPath, overrides) {
  const { evidence } = probe(repoPath);
  const steps = commands(overrides, evidence);
  return runSteps(repoPath, steps);
}

export const dotnetAdapter = { probe, commands, run };
