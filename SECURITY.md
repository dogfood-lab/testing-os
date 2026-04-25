# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in `testing-os` or any of its packages, **do not open a public issue.** Instead, report it privately:

- **Email:** mikeyfrilot@gmail.com (subject: "testing-os security")
- **GitHub Security Advisories:** [Open a draft advisory](https://github.com/dogfood-lab/testing-os/security/advisories/new)

We aim to triage within 5 business days and ship a fix within 14 days for HIGH/CRITICAL issues.

## Scope

In scope:
- Code in `packages/*` published as `@dogfood-lab/*` on npm
- The swarm control-plane SQLite schema and write paths
- Schema validators in `@dogfood-lab/schemas`
- The HTTP read API exposed via `indexes/` and `policies/` (when consumers fetch them)

Out of scope:
- Issues in third-party dependencies (report upstream; we'll pin/patch when notified)
- Findings stored as evidence (those are intentionally public; the *system* is what we secure)
- Old `@dogfood-labs/*` packages (deprecated — see migration notice in README)

## Threat Model

`testing-os` is a **shared evidence store and protocol runner**. The threats we care about:

| Threat | Mitigation |
|--------|------------|
| Forged evidence submissions | Schema validation + signed dispatches via `gh api` (token-gated by repo permissions) |
| Tampered findings | Git history is the audit log; all writes go through PRs or repository_dispatch |
| Privilege escalation in CI | Workflows are paths-gated and run on `ubuntu-latest`; no self-hosted runners |
| Credential leakage | No secrets in code; all tokens are GitHub-managed |
| Denial via evidence flood | Rate-limited at the dispatcher tier (GitHub API quotas apply) |

## Disclosure

We follow [coordinated vulnerability disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure). After a fix ships and consumers have had time to upgrade, we publish a GitHub Security Advisory with details.
