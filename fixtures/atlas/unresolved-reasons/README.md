# unresolved-reasons

An Atlas fixture for import sites that do not resolve, each for its own
reason, the shapes ai-playtest, research-os, mcp-tool-registry and motif
have: vitest.config.ts probes an undeclared coverage provider with
require.resolve; src/sync.ts loads an optional package through a const
beside a comment, and catches its absence; scripts/verify.js requires the
manifest through a joined path, which is a read of it; and a Next.js app's
next-env.d.ts imports the route types a build generates. The page names
each unresolved site with why.
