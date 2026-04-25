/**
 * Context loader
 *
 * Gathers everything the verifier needs:
 * - Global policy
 * - Repo policy (optional, missing is valid)
 * - Scenario definitions from source repo (optional, missing becomes rejection reason)
 * - Payload normalization
 *
 * Scenario loading uses a fetch adapter so it can be stubbed in tests.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

/**
 * Load the global policy.
 *
 * @param {string} repoRoot
 * @returns {object}
 */
export function loadGlobalPolicy(repoRoot) {
  const path = join(repoRoot, 'policies', 'global-policy.yaml');
  return yaml.load(readFileSync(path, 'utf-8'));
}

/**
 * Load repo-specific policy. Returns null if no policy exists.
 *
 * @param {string} repoSlug - e.g. "mcp-tool-shop-org/dogfood-labs"
 * @param {string} repoRoot
 * @returns {object|null}
 */
export function loadRepoPolicy(repoSlug, repoRoot) {
  const [org, repo] = repoSlug.split('/');
  if (!org || !repo || /\.\.|[/\\]/.test(org) || /\.\.|[/\\]/.test(repo)) return null;
  const path = join(repoRoot, 'policies', 'repos', org, `${repo}.yaml`);

  if (!existsSync(path)) return null;
  try {
    return yaml.load(readFileSync(path, 'utf-8'));
  } catch {
    console.warn(`load-context: malformed YAML in repo policy for ${repoSlug}`);
    return null;
  }
}

/**
 * Default scenario fetcher that reads from the local filesystem.
 * Used when dogfood-labs is dogfooding itself.
 *
 * @param {string} repoRoot - Root of the source repo
 * @returns {object} Scenario fetch adapter
 */
export function localScenarioFetcher(repoRoot) {
  return {
    async fetch(scenarioId) {
      if (!/^[\w-]+$/.test(scenarioId)) return null;
      const path = join(repoRoot, 'dogfood', 'scenarios', `${scenarioId}.yaml`);
      if (!existsSync(path)) return null;
      return yaml.load(readFileSync(path, 'utf-8'));
    }
  };
}

/**
 * GitHub scenario fetcher. Loads scenario definitions from a source repo
 * via the GitHub API at a specific commit SHA.
 *
 * @param {string} token - GitHub PAT
 * @param {string} repoSlug - e.g. "mcp-tool-shop-org/shipcheck"
 * @param {string} commitSha - Commit to fetch scenarios from
 * @returns {object} Scenario fetch adapter
 */
export function githubScenarioFetcher(token, repoSlug, commitSha) {
  const [org, repo] = repoSlug.split('/');
  if (!org || !repo || /\.\.|[/\\]/.test(org) || /\.\.|[/\\]/.test(repo)) {
    return { async fetch() { return null; } };
  }
  return {
    async fetch(scenarioId) {
      if (!/^[\w-]+$/.test(scenarioId)) return null;
      const path = `dogfood/scenarios/${scenarioId}.yaml`;
      const url = `https://api.github.com/repos/${repoSlug}/contents/${path}?ref=${commitSha}`;

      try {
        const resp = await globalThis.fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.raw+json',
            'X-GitHub-Api-Version': '2022-11-28'
          }
        });
        if (!resp.ok) return null;
        const text = await resp.text();
        return yaml.load(text);
      } catch {
        return null;
      }
    }
  };
}

/**
 * Load all scenario definitions referenced by a submission's scenario_results.
 *
 * @param {object} submission
 * @param {object} scenarioFetcher - { fetch(scenarioId) => Promise<object|null> }
 * @returns {Promise<{ scenarios: Map<string, object>, errors: string[] }>}
 */
export async function loadScenarios(submission, scenarioFetcher) {
  const scenarios = new Map();
  const errors = [];

  for (const sr of submission.scenario_results || []) {
    const id = sr.scenario_id;
    if (scenarios.has(id)) continue;

    const definition = await scenarioFetcher.fetch(id);
    if (definition) {
      scenarios.set(id, definition);
    } else {
      errors.push(`scenario "${id}" could not be loaded from source repo`);
    }
  }

  return { scenarios, errors };
}
