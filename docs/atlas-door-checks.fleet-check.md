# Atlas door checks: the fleet check

**What this is.** The precision run that `docs/atlas-production.spec.md` (Part 5) requires before a door check ships: every rule run over every repository on the published fleet page, every firing read by the coordinator against the repository, and the error rate stated. Run 2026-09-30 on slice AI's engine, before release 1.24.0. Repositories are counted here, not named: a finding about a named repository belongs to that repository, not to this page.

## Method

- The 79 repositories of the fleet index (`indexes/atlas/fleet.json` on the render branch), each cloned shallow at its default branch on 2026-09-30.
- `atlas check` run in each with the slice's engine (`scripts` in the coordinator's tools: `fleet-check.mjs`). It writes nothing; every clone was clean after it.
- For every door notice, the last three runs of that workflow on the default branch were read from GitHub, and the notice was judged against them and against the files it names.

## Results

| Rule | Firings | Repositories | Judged wrong | Rate | Status |
|---|---|---|---|---|---|
| D1, toolchain (Node) | 8 | 5 | 0 | 0 of 8 | ships, provisional (under 20 firings) |
| D1-python | 0 | 0 | — | — | ships, provisional (no firing to judge) |
| D2, lockfile platform | 1 | 1 | 1 | 1 of 1 before the fix; 0 of 0 after | ships, provisional (see below) |
| `ATLAS_MAP_ENGINE_OLDER` | 78 | 78 | 0 | 0 of 78 | ships |

**D1.** Every firing is a true fact: a job pins a Node version outside the `engines.node` range of the tool a step runs, and the notice reads the pin, the step and the lockfile line correctly. Seven of the eight are on doors whose last runs are green, and say "declares", not "refuses": the tool (Vitest 5 on Node 20 in six of them, a coverage reporter on Node 18 in one) declares a range it is not running in, and no start check enforces it. One of the eight is a break that CI hides: that repository's test job has not run its tests since the tool's major bump, because the tool exits at start on the pinned Node and the step pipes its output through a command that hides the exit code, so the job reads green. The "declares" tier is what caught it. The two repositories the triage of 2026-09-30 found red for this cause were repaired the same day, before this run; the pre-repair clone of one of them fires as expected, and the fixture holds its shape.

**D2.** The fleet's one firing was wrong, and it was wrong at the class: the door runs `npm install`, not `npm ci`, and its last three deploys were green, because `npm install` adds the binding the lock lacks for the platform it runs on. `npm ci` installs the lock as written, which is where the missing binding breaks the job. The rule now fires on `npm ci` alone and lists an `npm install` as not judged, with that reason, and a fixture workflow holds it. After the fix the fleet has no D2 firing at its default branches: the repository the triage found red for this cause rewrote its lock the same day. The rule is proven on the pre-repair clone of that repository (one firing, six packages, as the spec's acceptance item 6 asks) and on a measurement of 395 lockfiles on the coordinator's machine (389 complete, 6 with the Windows-only shape). Provisional until the fleet shows firings of its own.

**`ATLAS_MAP_ENGINE_OLDER`.** 78 of 79 maps were made by an older engine (none records the current one); the notice is right on each. It is a notice, not a gate.

**Not a finding, noted.** 41 of the 79 checks exited 1: their committed maps were made by engines from 1.14.0 to 1.22.0, and the current engine reads more than those did, so the tree no longer matches the map. That is the engine skew the pin-bump wave (spec Part 7) removes by regenerating each map at the new pin; it says nothing about the door checks.

## Not measured

- How many doors each rule judged and how many it set aside as not judged (no setup step, an unresolvable pin, a self-hosted runner, an unread lock). `atlas check` prints firings, not the judged count; a later round should count both.
- pnpm and yarn lockfiles are not read, by design in this version.
