# build-config

An Atlas fixture. The package installs `tool` from `dist/bin/tool.js` and exports
`dist/index.js`, both compiled from `src/` by `tsc -p tsconfig.build.json`; the
`outDir` lives only in that build config, not in `tsconfig.json`. `legacy` is
installed from `out/legacy.js`, which no tracked config builds. `dist/` and `out/`
are ignored, so a clean clone has neither.
