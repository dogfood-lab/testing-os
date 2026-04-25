import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generatePortfolio, computeFreshnessDays } from './generate.js';

const freshDate = new Date(Date.now() - 2 * 86400000).toISOString(); // 2 days ago
const staleDate = new Date(Date.now() - 60 * 86400000).toISOString(); // 60 days ago

const sampleIndex = {
  'mcp-tool-shop-org/shipcheck': {
    cli: {
      run_id: 'shipcheck-1-1',
      verified: 'pass',
      verification_status: 'accepted',
      finished_at: freshDate,
      path: 'records/mcp-tool-shop-org/shipcheck/run-shipcheck-1-1.json',
    },
  },
  'mcp-tool-shop-org/glyphstudio': {
    desktop: {
      run_id: 'glyphstudio-1-1',
      verified: 'pass',
      verification_status: 'accepted',
      finished_at: staleDate,
      path: 'records/mcp-tool-shop-org/glyphstudio/run-glyphstudio-1-1.json',
    },
  },
};

const samplePolicies = {
  'mcp-tool-shop-org/shipcheck': {
    enforcement: { mode: 'required', reason: null, review_after: null },
    surfaces: {
      cli: { scenario: 'self-gate-real-repo', max_age_days: 14, warn_age_days: 7 },
    },
  },
  'mcp-tool-shop-org/glyphstudio': {
    enforcement: { mode: 'required', reason: null, review_after: null },
    surfaces: {
      desktop: { scenario: 'export-roundtrip-16x16', max_age_days: 30, warn_age_days: 14 },
    },
  },
  'mcp-tool-shop-org/missing-repo': {
    enforcement: { mode: 'warn-only', reason: 'new repo', review_after: null },
    surfaces: {
      cli: { scenario: 'test-scenario', max_age_days: 30, warn_age_days: 14 },
    },
  },
};

describe('computeFreshnessDays', () => {
  it('returns 0 for now', () => {
    assert.equal(computeFreshnessDays(new Date().toISOString()), 0);
  });

  it('returns correct days for past date', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    assert.equal(computeFreshnessDays(threeDaysAgo), 3);
  });
});

describe('generatePortfolio', () => {
  it('produces correct coverage counts', () => {
    const result = generatePortfolio(sampleIndex, samplePolicies);
    assert.equal(result.coverage.total_repos, 2);
    assert.equal(result.coverage.surfaces_covered, 2); // cli + desktop
    assert.equal(result.coverage.surfaces_total, 8);
  });

  it('includes all repos from index', () => {
    const result = generatePortfolio(sampleIndex, samplePolicies);
    const repos = result.repos.map(r => r.repo);
    assert.ok(repos.includes('mcp-tool-shop-org/shipcheck'));
    assert.ok(repos.includes('mcp-tool-shop-org/glyphstudio'));
  });

  it('populates entry fields correctly', () => {
    const result = generatePortfolio(sampleIndex, samplePolicies);
    const shipcheck = result.repos.find(r => r.repo.includes('shipcheck'));
    assert.equal(shipcheck.surface, 'cli');
    assert.equal(shipcheck.verified, 'pass');
    assert.equal(shipcheck.enforcement, 'required');
    assert.equal(shipcheck.scenario, 'self-gate-real-repo');
    assert.equal(shipcheck.run_id, 'shipcheck-1-1');
    assert.ok(shipcheck.freshness_days <= 2);
  });

  it('detects stale repos', () => {
    const result = generatePortfolio(sampleIndex, samplePolicies);
    assert.equal(result.stale.length, 1);
    assert.equal(result.stale[0].repo, 'mcp-tool-shop-org/glyphstudio');
    assert.ok(result.stale[0].freshness_days >= 59);
  });

  it('detects missing repos (policy but no index entry)', () => {
    const result = generatePortfolio(sampleIndex, samplePolicies);
    assert.equal(result.missing.length, 1);
    assert.equal(result.missing[0].repo, 'mcp-tool-shop-org/missing-repo');
    assert.equal(result.missing[0].surface, 'cli');
    assert.equal(result.missing[0].enforcement, 'warn-only');
  });

  it('handles empty index', () => {
    const result = generatePortfolio({}, samplePolicies);
    assert.equal(result.coverage.total_repos, 0);
    assert.equal(result.missing.length, 3); // all 3 surfaces from policies
  });

  it('handles empty policies', () => {
    const result = generatePortfolio(sampleIndex, {});
    assert.equal(result.coverage.total_repos, 2);
    assert.equal(result.stale.length, 1); // glyphstudio at 60d > default 30d
    assert.equal(result.missing.length, 0);
  });

  it('defaults enforcement to required when no policy', () => {
    const result = generatePortfolio(sampleIndex, {});
    const shipcheck = result.repos.find(r => r.repo.includes('shipcheck'));
    assert.equal(shipcheck.enforcement, 'required');
  });

  it('includes generatedAt timestamp', () => {
    const result = generatePortfolio(sampleIndex, samplePolicies);
    assert.ok(result.generatedAt);
    assert.ok(new Date(result.generatedAt).getTime() > 0);
  });
});
