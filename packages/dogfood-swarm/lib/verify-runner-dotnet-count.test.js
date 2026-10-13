/**
 * VSTest's "Passed!" summary is the dotnet test stream. It matches none of
 * the TAP, spec, jest, pytest, or cargo patterns, so a real suite used to
 * land as unmeasured_tests and block the serial-verify gate.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runSteps } from './verify/runner.js';
import { selectAdapter } from './verify/registry.js';
import { dotnetAdapter } from './verify/adapters/dotnet.js';

const CWD = tmpdir();
const fixtureDirs = [];

after(() => {
  for (const d of fixtureDirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* Windows lock lag */ }
  }
});

function echoStep(name, text, { exitCode = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'verify-dotnet-fixture-'));
  fixtureDirs.push(dir);
  const dataFile = join(dir, 'out.txt').replace(/\\/g, '/');
  const emitFile = join(dir, 'emit.cjs').replace(/\\/g, '/');
  writeFileSync(dataFile, text, 'utf-8');
  writeFileSync(
    emitFile,
    `process.stdout.write(require("fs").readFileSync(${JSON.stringify(dataFile)},"utf8"));process.exitCode=${exitCode};`,
    'utf-8',
  );
  return { name, cmd: 'node', args: [emitFile] };
}

const THREE_PROJECTS = [
  'Passed!  - Failed:     0, Passed:  1401, Skipped:     0, Total:  1401, Duration: 12 s - InControl.Core.Tests.dll (net9.0)',
  'Passed!  - Failed:     0, Passed:    75, Skipped:     0, Total:    75, Duration: 2 s - InControl.Services.Tests.dll (net9.0)',
  'Passed!  - Failed:     0, Passed:    19, Skipped:     0, Total:    19, Duration: 1 s - InControl.Inference.Tests.dll (net9.0)',
  '',
].join('\n');

describe('extractTestCount measures VSTest Passed! summaries', () => {
  it('sums Passed across test projects', () => {
    const res = runSteps(CWD, [echoStep('test', THREE_PROJECTS)]);
    assert.equal(res.test_count, 1495);
    assert.equal(res.tests_ran, true);
    assert.equal(res.verdict, 'pass');
  });
});

describe('dotnet adapter probe', () => {
  it('selects dotnet for a solution with test projects and does not name the app', () => {
    const dir = mkdtempSync(join(tmpdir(), 'verify-dotnet-repo-'));
    fixtureDirs.push(dir);
    writeFileSync(join(dir, 'Sample.sln'), 'Microsoft Visual Studio Solution File', 'utf-8');
    const testDir = join(dir, 'tests', 'Sample.Tests');
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, 'Sample.Tests.csproj'), '<Project />', 'utf-8');
    mkdirSync(join(dir, 'src', 'Sample.App'), { recursive: true });
    writeFileSync(join(dir, 'src', 'Sample.App', 'Sample.App.csproj'), '<Project />', 'utf-8');
    const soakDir = join(dir, 'tests', 'Sample.SoakTests');
    mkdirSync(soakDir, { recursive: true });
    writeFileSync(join(soakDir, 'Sample.SoakTests.csproj'), '<Project><PropertyGroup><OutputType>Exe</OutputType></PropertyGroup></Project>', 'utf-8');

    const selection = selectAdapter(dir);
    assert.equal(selection.name, 'dotnet');
    const steps = dotnetAdapter.commands({}, selection.probe.evidence);
    assert.equal(steps.length, 1);
    assert.equal(steps[0].name, 'test');
    assert.ok(steps[0].args.includes('tests/Sample.Tests/Sample.Tests.csproj'));
    assert.equal(steps[0].args.includes('src/Sample.App/Sample.App.csproj'), false);
    assert.equal(steps[0].args.includes('tests/Sample.SoakTests/Sample.SoakTests.csproj'), false);
  });
});
