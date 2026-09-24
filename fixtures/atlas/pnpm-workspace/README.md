# pnpm-workspace

A pnpm workspace declared only in pnpm-workspace.yaml, the way glyphstudio and
attestia are. packages/domain loads its source through main; packages/state
points main at dist/, which tsconfig.json builds from src/; packages/ignored is
excluded by a `!` glob, so an import of it is not a workspace edge. The desktop
app imports every member, a declared dependency (react) and an undeclared one
(left-pad), which resolves to nothing and must be counted as unresolved.
