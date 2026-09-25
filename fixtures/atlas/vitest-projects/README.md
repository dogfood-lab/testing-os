# vitest-projects

An Atlas fixture for pnpm handing a command to a binary and vitest handing
its run to projects, the shape motif has. CI runs `pnpm vitest run`; the
root package has no script named vitest, so pnpm runs the vitest binary. The
root config's projects are every package: packages/a has its own config and
include, and packages/b uses vitest's defaults.
