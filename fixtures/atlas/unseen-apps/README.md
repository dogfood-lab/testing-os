# unseen-apps

An Atlas fixture for what runs where no workflow reaches, the shapes
stillpoint, xrpl-creator-capsule, vocal-synth-engine and multi-claude have. A
Tauri app under apps/desktop that CI never builds; a Dockerfile, fly.toml and
render.yaml that CI never runs; and a UI that calls the server over HTTP,
through a helper that joins a base to a path and through fetch with the whole
path, at two routes the server mounts under /api. The UI's EventSource names
a route the server does not have.
