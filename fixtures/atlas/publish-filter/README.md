# publish-filter

An Atlas fixture for pnpm publishing workspace members by --filter, the
shape storyboard-os has: the release publishes @s/core with
`pnpm publish --filter` and @s/ui with `pnpm --filter ... publish`, and
never the private tools member. Each member it publishes is a package
people import, with a door of its own.
