# gated-runs

Work held to one trigger, the way ollama-intern-mcp's workflows hold it. CI's
cloud-smoke job runs only by hand, and one of its steps only when the run is
given run_generate; a step of the test job runs only on a pull request. The
release publishes on a tag, and by hand only when dry_run is false (it defaults
to true, when the step before it runs npm publish --dry-run); it creates the
GitHub release only on a tag.
