# Atlas test gaps and harness suggestions: research grounding

Status: the research grounding for `docs/atlas-test-gaps.spec.md`, approved by the Director 2026-09-26.

**Verification** (2026-09-26; the receipts, retrieved source passages and scripts are kept with the coordinator's tools, outside the repository):
- **The runner.** All 11 arXiv and DOI identifiers resolved, and none were fabricated. The different-family lens (mistral-small:24b, reasoning-stripped) supported findings 2, 3, 6, 7, 8, 9 and 10.
- **The manual two-family check.** mistral-small:24b and granite4.1:30b judged each claim against the passage retrieved from the source itself, and both marked all five SUPPORTED: 1 (White, author PDF), 4 (Sadowski's chapter), 5 (Distefano, author manuscript), 14 (Eder, publisher's PDF) and 15 (Haas, author PDF).
- **Corrected while checking.** Eder's figures are 43% and 40% of changed methods, not "about half". Haas reports that ranking matched experts, not that flat lists failed. Finding 4's source moved from the CACM article, which could not be retrieved, to the same author's chapter.
- **The cloud jury.** The largest thinking models on the live Ollama Cloud roster, kimi-k3, glm-5.3, deepseek-v4-pro:0813 and minimax-m3, judged findings 1-10, 14 and 15 against the same source passages. All twelve were confirmed by all four families, and nothing was refuted.
- **Not cross-checked by a second family:** findings 11 to 13 (Beller 2015 and 2019, Kochhar 2013). They are background on how common thin testing is, and no architectural choice rests on them.

## Research grounding (the dispatch's empirical floor)

### Finding the gaps

1. **An automatic test-to-code linking approach reached a mean average precision of 78% for links from tests to functions and 93% for links from test classes to classes, across four large open-source systems.** White et al. 2020 (DOI:10.1145/3377811.3380921). Atlas states test reach at the file and part level, where static linking is reliable, and qualifies anything finer.
2. **In 27 long-lived Java libraries, instructions and branches inside catch blocks and throw statements were significantly less covered than code overall.** Lima et al. 2021 (arXiv:2105.00500). A healthy overall coverage figure hides untested failure paths, so Atlas counts error-handling constructs in files no test reaches and ranks those gaps higher.
3. **In 2025, coding agents added tests more often than other committers and added mocks to tests more often (36% of their commits against 26%).** Hora & Robbes 2026 (arXiv:2602.00409). A test's presence is evidence, not proof; suggestions name the behaviour a test should exercise, not only that a test file exists.

### Making suggestions that get acted on

4. **Google integrates static analysis into code review, where developers are already in a change mindset, and requires checks to produce less than 10% effective false positives.** Sadowski 2020, "Static Analysis", ch. 20 of *Software Engineering at Google* (https://abseil.io/resources/swe-book/html/ch20.html). Suggestions appear when a person or agent asks at work time, most often through the pre-commit question. A rule wrong more than one time in ten does not ship.
5. **At Facebook, the same Infer analysis, at the same false-positive rate, was fixed about 70% of the time when reported at diff time in code review and about 0% of the time when delivered as batch bug lists outside the engineers' workflow.** Distefano et al. 2019 (DOI:10.1145/3338112). There is no fleet-wide list of gaps; the answer comes back in the turn where the work happens.
6. **Open-source practitioners described pull-request bot comments mainly as noise that overwhelms and distracts.** Wessel et al. 2021 (arXiv:2103.13950). Atlas posts nothing on its own; the feature is query-driven, as the Director directed.
7. **Language models that read their own execution feedback and retried solved more programming tasks than one-shot generation.** Chen et al. 2024 (arXiv:2304.05128). Agents are the ones who act; Atlas feeds them a precise, checkable gap and the command that closes it.
8. **Giving a language model access to a compiler turned it into an iterative agent and sharply reduced compilation errors.** Kjellberg et al. 2026 (arXiv:2601.12146). Same implication: a tight feedback signal in the agent's own loop is what changes behaviour.
9. **Lightweight call and inheritance structure improved code agents' localization and roughly halved run-to-run variance, while denser annotation showed diminishing returns, "who calls me" links suited hub-heavy projects, and the structure cost about 10% more input tokens.** Lin et al. 2026 (arXiv:2606.26979). An answer returns a short ranked list, never every gap in the repository, and leads with what reaches the gap.
10. **AI agents authored 16.4% of test-adding commits in real repositories, and their tests contributed coverage comparable to human-written tests.** Yoshimoto et al. 2026 (arXiv:2603.13724). The bottleneck is direction rather than capability: Atlas points, and the agent writes the test.

### How common the problem is

11. **In 85% of monitored IDE sessions developers ran no tests, and test-driven development appeared in 4% of sessions.** Beller et al. 2015 (DOI:10.1145/2786805.2786843). Self-reports, commit messages and pull-request text never count as evidence that something is tested; only the map and measured coverage do.
12. **Developers believed they spent about half their time testing, spent about a quarter in fact, and half never ran a test.** Beller et al. 2019 (https://ieeexplore.ieee.org/document/8116886). Same implication as finding 11.
13. **Of 20,000+ open-source projects, 38% had no test cases at all.** Kochhar et al. 2013 (https://mysmu.edu/faculty/lxjiang/papers/qsic13test.pdf). A repository with no runner gets a "start a harness" answer, not only gap-finding inside tests that do not exist.
14. **In an industrial system, 43% and 40% of the changed methods in two releases were not tested, and the bug probability of untested code overall was less than half that of changed-but-untested code.** Eder et al. 2013 (https://ieeexplore.ieee.org/document/6595800). Test gap analysis, changed code set against what the tests exercise, is the join Atlas makes once coverage exists.
15. **An automated ranking of test gaps by risk performed on par with expert assessments, and even a lightweight prioritization helped practitioners identify high-risk test gaps and filter out low-risk ones.** Haas et al. 2025 (https://ieeexplore.ieee.org/document/10945563). Gaps are ranked by the risks Atlas already measures: fan-in, being on a door's path, change frequency and error-handling density.
