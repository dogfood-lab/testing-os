# package-managers

An Atlas fixture. One workflow starts the package scripts through pnpm (a
script by name, `run`, a script that calls two more, `-r` across the
workspace and `--filter` for one member), through yarn (a script by name and
`workspace <name>`), and through `bun run`. `pnpm audit` is pnpm's own
command, so the `audit` script is never run.
