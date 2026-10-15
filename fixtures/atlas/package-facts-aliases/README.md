# package-facts-aliases

An Atlas fixture for specifiers that look like bare package names and are not
packages (docs/atlas-buildup.spec.md, slice AO, R&D's review of #173). src/main.ts
imports four of them: `@/lib/util` through a tsconfig `paths` alias,
`shared/util` through another `paths` alias whose name is a valid package name
but which resolves to src/lib/util.js and which no manifest declares,
`#internal/util` through the package's own `imports` field, and `$lib/unreached`,
a SvelteKit-style alias nothing here resolves. It also imports `lodash` and
`JSONStream` (an old package whose name has capitals), which are packages. Only
those two belong in the file's `packages`.
