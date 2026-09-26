# spawn-mcp-transport

An Atlas fixture for a test that starts an MCP server the way a client
does: test/server.test.ts hands the MCP SDK's StdioClientTransport a
command and its arguments, `node --import tsx src/server.ts`, and the
transport starts the server as a child process. The test runs
src/server.ts. ai-jam-sessions tests its server this way.
