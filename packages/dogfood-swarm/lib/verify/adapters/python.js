/**
 * python.js — Python verification adapter.
 *
 * Probe: looks for pyproject.toml, setup.py, requirements.txt, ruff.toml.
 * Commands: ruff check, pytest, mypy (optional).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSteps } from '../runner.js';

function probe(repoPath) {
  const evidence = {};
  let score = 0;

  if (existsSync(join(repoPath, 'pyproject.toml'))) {
    score += 50;
    evidence.pyprojectToml = true;
    try {
      const content = readFileSync(join(repoPath, 'pyproject.toml'), 'utf-8');
      evidence.hasRuff = content.includes('[tool.ruff]') || content.includes('ruff');
      evidence.hasPytest = content.includes('pytest') || content.includes('[tool.pytest');
      evidence.hasMypy = content.includes('mypy');
      if (evidence.hasPytest) score += 20;
    } catch { /* */ }
  }

  if (existsSync(join(repoPath, 'setup.py'))) {
    score += 30;
    evidence.setupPy = true;
  }

  if (existsSync(join(repoPath, 'requirements.txt'))) {
    score += 10;
    evidence.requirements = true;
  }

  if (existsSync(join(repoPath, 'ruff.toml'))) {
    score += 10;
    evidence.ruffToml = true;
    evidence.hasRuff = true;
  }

  // Check for tests/ directory
  if (existsSync(join(repoPath, 'tests'))) {
    evidence.testsDir = true;
    score += 10;
  }

  // Check for venv
  if (existsSync(join(repoPath, '.venv')) || existsSync(join(repoPath, 'venv'))) {
    evidence.venv = true;
  }

  const reason = score > 0
    ? `Python project (${[evidence.pyprojectToml && 'pyproject', evidence.setupPy && 'setup.py'].filter(Boolean).join(', ')})`
    : 'No Python project markers found';

  return { score: Math.min(score, 100), reason, evidence };
}

function commands(overrides = {}) {
  const steps = [];

  // Lint
  steps.push(overrides.lint ?? {
    name: 'lint',
    cmd: 'ruff',
    args: ['check', '.'],
    optional: true,
  });

  // Typecheck
  steps.push(overrides.typecheck ?? {
    name: 'typecheck',
    cmd: 'mypy',
    args: ['.'],
    optional: true,
  });

  // Test
  steps.push(overrides.test ?? {
    name: 'test',
    cmd: 'pytest',
    args: ['-v'],
  });

  return steps.filter(Boolean);
}

function run(repoPath, overrides) {
  const steps = commands(overrides);
  return runSteps(repoPath, steps, { continueOnError: true });
}

export const pythonAdapter = { probe, commands, run };
