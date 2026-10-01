# init-shapes

Four repositories, one per shape `atlas init` used to leave files in no part:

- `nested-crates`: two crates inside `kb/`, beside the knowledge base's own
  scripts, catalog and README. `kb/` keeps a part for what the crates leave.
- `project-home`: a package with a manifest and a Python directory with none,
  side by side in `packages/`. Each is a part.
- `seed-workspace`: a pnpm workspace of seeds under `packages/`, each with a
  `site/` of its own, one seed with a `package.json`, one a .NET solution
  that carries the workflows of the repository it came from, and one a Python
  seed with those workflows and no manifest. Each seed is one part with role
  code, its site in it, and `packages/README.md` is in a part of `packages/`. With no workspace file, the seeds are still parts, each
  keeping what its nested projects leave.
- `dotnet-projects`: two `.csproj` projects side by side in `src/`, with a
  `Directory.Build.props` beside them. Each project is a part with role code,
  and `src/` keeps a part for the props file.
