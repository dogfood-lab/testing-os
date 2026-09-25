# nested-namesake

An Atlas fixture for an installed dependency whose import name matches a
subpackage of the project, the shape prism-verify has: the project's
`src/tool/mcp/` package imports `mcp.types` from the installed MCP SDK.
The subpackage is `tool.mcp`, never the top-level `mcp`, so the import is
the dependency and nothing local shares its name.
