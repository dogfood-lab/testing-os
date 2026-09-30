# lockfile-reader

An Atlas fixture for the lockfile reader behind the door checks
(docs/atlas-production.spec.md, Part 3). The root `package-lock.json` is
lockfileVersion 3 with a workspace member, `site-docs` in `site/`, linked
from the root's `node_modules`. It holds `astro` with its engines and bin,
`esbuild` listing three optional bindings of which it holds one, a copy of
`esbuild` nested under another package with its own binding beside it, and
`vite` installed under the member alone. `legacy/` holds a lockfileVersion
2 lock, `old/` a lockfileVersion 1 lock and `broken/` one that does not
parse.
