# spawn-ts-source

An Atlas fixture for a TypeScript test that starts its CLI by the path the
compiled test will find it at: src/tests/cli.test.ts spawns `../cli.js`
next to itself, which is src/cli.ts in source, as TypeScript's own `.js`
import convention reads it (tsc compiles both into dist/). The test runs
src/cli.ts. bytefit tests its CLI this way.
