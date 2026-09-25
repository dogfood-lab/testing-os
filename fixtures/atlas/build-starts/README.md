# build-starts

Atlas fixtures for a door that builds a package, one repository per
directory. Each pull request builds the package, type-checks it with
`tsc --noEmit`, runs its tests and a gate script that imports nothing. In
tsup/ tsup builds the entry it is handed; in tsc/ `tsc -p` emits to the
outDir of tsconfig.build.json; in vite/ vite builds the library its config
names. The build is said as a build, never a check, and the path starts at
the package's entry, which is a barrel, not at the gate script.
