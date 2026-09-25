# positive-gates

An Atlas fixture for job gates and a run by hand, the shape
mcp-tool-registry and research-os have. In ops.yml one job runs only on a
schedule or by hand and another only on a push or by hand, each written as
the events it runs on, on a workflow that takes a push only to main; in
release.yml a job is held off a release event, on a workflow a tag push and
a run by hand also start. Each gate reads as the triggers it holds on, a run
by hand kept.
