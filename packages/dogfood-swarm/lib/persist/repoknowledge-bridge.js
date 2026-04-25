/**
 * repoknowledge-bridge.js — Bridge from swarm control plane to repo-knowledge audit DB.
 *
 * Transforms a canonical run export into the repo-knowledge audit import format:
 *   run.json    — run metadata envelope
 *   findings.json — normalized findings
 *   metrics.json  — severity counts and coverage
 *
 * Compatible with `rk audit import <dir>` and `audit_submit` MCP tool.
 */

/**
 * Build a repo-knowledge audit payload from a canonical run export.
 *
 * @param {object} exportData — output of buildRunExport()
 * @returns {{ run: object, findings: object[], metrics: object }}
 */
export function buildAuditPayload(exportData) {
  const run = exportData.run;
  const findingSummary = exportData.findings.summary;
  const findingItems = exportData.findings.items;

  // Map swarm finding status to audit status
  const statusMap = {
    new: 'open',
    recurring: 'open',
    approved: 'open',
    fixed: 'fixed',
    deferred: 'accepted_risk',
    rejected: 'false_positive',
  };

  // Map swarm categories to audit domains
  const domainMap = {
    bug: 'code_quality',
    security: 'security_sast',
    quality: 'code_quality',
    types: 'code_quality',
    tests: 'testing',
    docs: 'documentation',
    defensive: 'code_quality',
    observability: 'monitoring',
    degradation: 'code_quality',
    ux: 'code_quality',
    accessibility: 'code_quality',
  };

  // Build audit findings
  const auditFindings = findingItems.map(f => ({
    domain: domainMap[f.category] || 'code_quality',
    title: `[${f.severity}] ${f.description.slice(0, 80)}`,
    description: f.description,
    severity: f.severity.toLowerCase(),
    confidence: 'high',
    status: statusMap[f.status] || 'open',
    location: f.file ? `${f.file}${f.line ? ':' + f.line : ''}` : undefined,
    tool_source: 'swarm-control-plane',
    remediation: f.recommendation || undefined,
  }));

  // Compute domains checked from findings + verification
  const domainsChecked = new Set();
  for (const f of auditFindings) domainsChecked.add(f.domain);
  if (exportData.verification.length > 0) {
    domainsChecked.add('testing');
    domainsChecked.add('cicd');
  }

  // Determine overall status
  const criticalCount = findingSummary.by_severity?.CRITICAL || 0;
  const highCount = findingSummary.by_severity?.HIGH || 0;
  const openFindings = (findingSummary.by_status?.new || 0) + (findingSummary.by_status?.recurring || 0) + (findingSummary.by_status?.approved || 0);

  let overallStatus, overallPosture;
  if (criticalCount > 0) {
    overallStatus = 'fail';
    overallPosture = 'critical';
  } else if (openFindings > 0) {
    overallStatus = 'pass_with_findings';
    overallPosture = highCount > 0 ? 'needs_attention' : 'healthy';
  } else {
    overallStatus = 'pass';
    overallPosture = 'healthy';
  }

  // Get test count from verification
  const testCount = exportData.verification.reduce((sum, v) => sum + (v.test_count || 0), 0);

  const auditRun = {
    slug: run.repo,
    commit_sha: run.commit_sha,
    branch: run.branch,
    auditor: 'swarm-control-plane',
    scope_level: 'full',
    overall_status: overallStatus,
    overall_posture: overallPosture,
    domains_checked: [...domainsChecked].sort(),
    summary: `Swarm audit: ${findingSummary.total} findings (${criticalCount} critical, ${highCount} high). ${exportData.waves.length} waves, ${exportData.promotions.length} promotions.`,
    blocking_release: criticalCount > 0,
    started_at: run.created,
    completed_at: run.completed,
  };

  const metrics = {
    critical_count: criticalCount,
    high_count: highCount,
    medium_count: findingSummary.by_severity?.MEDIUM || 0,
    low_count: findingSummary.by_severity?.LOW || 0,
    info_count: 0,
    test_count: testCount,
    controls_passed: exportData.waves.filter(w => w.status === 'advanced' || w.status === 'verified').length,
    controls_failed: exportData.waves.filter(w => w.status === 'failed').length,
    controls_total: exportData.waves.length,
  };

  return { run: auditRun, findings: auditFindings, metrics };
}
