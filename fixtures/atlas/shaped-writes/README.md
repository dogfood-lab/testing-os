# shaped-writes

An Atlas fixture for a write whose file name is read at run time right under
a tracked directory that also holds hand-written files, the shape
mcp-tool-registry's bundles/ has. scripts/build-bundles.mjs writes
bundles/<id>.json for each rule under bundles/rules/; the write lands on
bundles/*.json, and bundles/rules/ stays hand-written.
