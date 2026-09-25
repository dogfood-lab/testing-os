# gated-writes

An Atlas fixture for work split across gated jobs, the shape
mcp-tool-registry's Operations has. One job runs on a push or by hand,
another on a schedule or by hand, and a third on an issue. The derive script
the first two run is run on the triggers either holds on, never on an
issue, and the bundles the second job's script writes are written only on a
schedule or by hand.
