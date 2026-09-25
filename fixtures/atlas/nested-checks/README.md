# nested-checks

An Atlas fixture for a release that checks a package directory and the
directory holding it, the shape mcp-arcade has: `python -m build` packs
`src/tool` (hatch's wheel packages) and `ruff check .` lints what holds
it. The page names the parent alone,
never "src/tool/ and src/".
