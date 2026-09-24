# closure-roots

An Atlas fixture for writes made through a closure, the shape
vocal-synth-engine's analyze.ts uses. src/pack.js writes under a directory
read from the command line, in main and through a local writeAsset(relPath)
closure; the repository's own assets/ holds a committed file, so a map that
reads the root as unknown lands the writes there. src/export.js does the same
under a parameter of a module-level function its callers hand the command
line. src/stamp.js writes through a closure rooted at its own location, and
the calls it makes to the closure name a committed file.
