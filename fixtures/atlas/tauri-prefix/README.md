# tauri-prefix

An Atlas fixture for a desktop app a release builds through an npm script
run from the root, the shape sovereignty has: `npm --prefix app run tauri
build -- <args>` inside a shell `if`, the bundles uploaded as artifacts,
and a later job that downloads them and uploads them, with the updater's
`latest.json`, to the release. The release ships the desktop app.
