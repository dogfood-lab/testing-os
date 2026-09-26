# Atlas as an instrument agents and people consult: research grounding

Status: the research grounding for `docs/atlas-sidecar.spec.md`, approved by the Director 2026-09-26.

Verification (Step 4, 2026-09-26; receipts kept with the coordinator's tools, outside the repository): all 31 identifiers resolved (arXiv/Crossref oracle), 0 fabricated. Run 1 (prism receipt `prism-01m3ecbjg02g732hxzhz8sef0g`) flagged two claims whose numbers came from paper bodies (SWE-agent, Gloaguen); both were restated at abstract level and re-verified once. Run 2: 21 supported by the different-family lens (mistral-small:24b, reasoning-stripped). Manual two-family fallback (mistral-small:24b + granite4.1:30b on retrieved abstracts): LaToza & Myers 2010 and Wu et al. 2025 SUPPORTED by both. Not checked by a second family (no abstract obtainable, not load-bearing for the recommendation): findings 16, 19, 20, 22, 23, 26, 28, 29. Finding 19's 39% figure is from the paper body and is unverified.

## Research grounding (the dispatch's empirical floor)

### Agents and repository structure

1. **A purpose-built agent-computer interface significantly improved a language-model agent's ability to navigate repositories and edit code, and the interface's design changed the agent's behaviour and performance.** Yang et al. 2024 (arXiv:2405.15793). Atlas answers go out as small, bounded tool results designed for agents; the 1.8 MB structure.json is never handed to an agent whole.
2. **Plugging a repository-level code graph into four different issue-resolution methods substantially improved all of them on SWE-bench.** Ouyang et al. 2024 (arXiv:2410.14684). Repository structure measurably helps agents, so making the map reachable is worth building.
3. **A graph of files, classes, functions and imports let a fine-tuned 32B model reach 92.7% file-level localization accuracy.** Chen et al. 2025 (arXiv:2503.09089). Localization and reachability are where structure pays; the first tools answer "what reaches this" and "what does this reach".
4. **Letting an agent query a graph database extracted from a repository gave competitive results across three repository-level benchmarks.** Liu et al. 2024 (arXiv:2408.03910). Structure-aware retrieval is a workable agent interface; Atlas offers a few fixed structural questions rather than a query language, and does not duplicate text search.
5. **Repository context files such as AGENTS.md did not generally improve coding agents' task success while raising inference cost by over 20% on average, and the repository overviews in them were not helpful, although their instructions were followed.** Gloaguen et al. 2026 (arXiv:2602.11988). The map is not pasted into every session; agents query it, and any standing instruction stays a one-line pointer.
6. **Language models used information best at the start or end of a long input and significantly worse when it sat in the middle.** Liu et al. 2023 (arXiv:2307.03172). Tool results are capped and truncated with a count, never padded with every row.
7. **A three-step localize, repair, validate pipeline with no agent loop resolved 32.00% of SWE-bench Lite at $0.70 per instance.** Xia et al. 2024 (arXiv:2407.01489). The sidecar stays minimal: a handful of read-only tools, no planning loop, no model inside.

### Where code intelligence lives

8. **Stack graphs resolve names from per-file subgraphs built by syntactic analysis alone, with no build and no per-repository configuration, so indexing a commit costs only the files it touched.** Creager & van Antwerpen 2022 (arXiv:2211.01224). Atlas's committed, per-commit, build-free map is already this shape; it is served as it is, not recomputed live by a daemon.
9. **A systematic study of MCP catalogued 16 threat scenarios across four attacker types, including malicious developers and external attackers, and demonstrated them in real-world case studies.** Hou et al. 2025 (arXiv:2503.23278). Repository-derived strings in Atlas answers are returned as quoted data fields, length-capped, never as instructions.
10. **A demonstrated exploit chain drove an LLM through a malicious MCP server to code execution, remote access and credential theft on the client host.** Radosevich & Halloran 2025 (arXiv:2504.03767). The Atlas server has no write, shell or network tools.
11. **Of 640 internet-facing production MCP servers, 91.8% lacked OAuth authentication and 687 tool instances exposed unrestricted shell execution.** Padilla 2026 (arXiv:2608.00150). No hosted, internet-facing Atlas endpoint; the published fleet stays static files.

### Persona, voice and trust

12. **Adding a persona to the system prompt did not improve factual question-answering accuracy, and the best persona for a question could not be predicted in advance.** Zheng et al. 2024 (arXiv:2311.10054). "Atlas" is a name and an address, not a character; no persona prompt is written.
13. **With the same information held fixed, speech plus text raised how humanlike people found a system and how accurate they rated its information, and a first-person "I" raised accuracy ratings and lowered risk ratings in one context.** Cohn et al. 2024 (arXiv:2405.06079). Atlas answers keep the page's plain third-person statements of fact.
14. **A first-person expression of uncertainty lowered acceptance of wrong answers more than an impersonal hedge did.** Kim et al. 2024 (arXiv:2405.00623). Each answer states plainly what the map could not see for that question.
15. **Showing sources lowered reliance on incorrect answers, while explanations raised reliance on correct and incorrect answers alike.** Kim et al. 2025 (arXiv:2502.08554). Every answer names its source (the map commit and the files); no explanatory prose is layered on top.
16. **AI explanations increased acceptance of recommendations whether or not they were correct.** Bansal et al. 2021 (DOI:10.1145/3411764.3445717). Same rule: facts with sources, no persuasive narration.
17. **On medical questions, between 50% and 90% of responses from seven popular LLMs were not fully supported, and sometimes contradicted, by the sources they cited.** Wu et al. 2025 (DOI:10.1038/s41467-025-58551-6). A language model paraphrasing Atlas would mis-cite it; Atlas's own sentences are passed through unchanged.
18. **Role-playing personas shifted which facts models asserted according to the character's stance.** Kong et al. 2025 (arXiv:2411.07965). A model speaking as Atlas would bend facts; the persona option is rejected.

### Staleness and provenance

19. **Out-of-date content was the largest single category of documentation-content issues, 39%.** Aghajani et al. 2019 (DOI:10.1109/ICSE.2019.00122). Derived and CI-checked beats authored; the map stays derived.
20. **Code changes made with an inconsistent comment were about 1.5 times as likely to introduce a bug.** Wen et al. 2019 (DOI:10.1109/ICPC.2019.00019). Stale descriptions of code cost real defects, so every answer says how fresh it is.
21. **Across more than 3,000 GitHub projects, most contained at least one outdated code element reference in their documentation at some point in their history.** Tan et al. 2023 (arXiv:2212.01479). A clean snapshot is not a fresh one; answers say whether the file changed after the map was made.
22. **Comparing a stated high-level model against the source and reporting agreements and divergences helped engineers on large systems.** Murphy et al. 1995 (DOI:10.1145/222124.222136). `atlas check` is this comparison in CI; the sidecar reports it rather than hiding it.
23. **Trust rose with transparency up to a point and then fell.** Kizilcec 2016 (DOI:10.1145/2858036.2858402). Answers carry commit, date and engine version in one line, not a paragraph of caveats.
24. **Incomplete or invalid provenance metadata made people wrongly disbelieve honest content.** Feng et al. 2023 (DOI:10.1145/3610061). The freshness line is computed, never asserted, and it must itself be right.
25. **A tool built to keep architecture diagrams current still layered persisted human edits over automated recovery.** Correia et al. 2024 (arXiv:2407.17990). Atlas keeps its one human layer (part names, globs, summary) and nothing else.

### The questions people ask

26. **Programmers' 44 question types run from finding a focus point, through its direct relations, to connected subgraphs and groups of subgraphs.** Sillito et al. 2008 (DOI:10.1109/TSE.2008.26). The first tools answer focus and direct relations: where to start, what imports this, what this imports, which doors pass through.
27. **Half the bugs developers inserted in a lab study were associated with reachability questions, and 460 professional developers reported asking questions answerable as reachability questions more than 9 times a day.** LaToza & Myers 2010 (DOI:10.1145/1806799.1806829). "What does a change here reach" is the top tool.
28. **Developers anchored searches on limited and misleading cues that sent them down failed searches.** Ko et al. 2006 (DOI:10.1109/TSE.2006.116). A precomputed map removes guessing at names to search for.
29. **Professional developers spent about 58% of their time on program comprehension.** Xia et al. 2018 (DOI:10.1109/TSE.2017.2734091). Faster structural answers act on the largest share of the working day.
30. **Programmers using LLM coding assistants reported inaccuracies and a lack of contextual awareness among the assistants' main limitations.** Akhoroz & Yildirim 2025 (arXiv:2503.16508). The sidecar supplies that structure on request.
31. **In 11,579 real AI-assisted IDE sessions, developers managed the collaboration by injecting context by hand.** Tang et al. 2026 (arXiv:2604.00436). The sidecar replaces hand-supplied architectural context with a query.
