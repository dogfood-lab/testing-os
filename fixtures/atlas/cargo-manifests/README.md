# cargo-manifests

An Atlas fixture for what a Cargo workspace declares, the shape commandui,
asset-forge and the Tauri apps have. A virtual workspace at the root names
its members by a glob and by path, and declares serde for them. The engine
crate is a library; the cli crate declares one binary in [[bin]] and holds
another Cargo finds by convention under src/bin/; the desktop app is a
Tauri app whose Rust half, src-tauri, sits inside the web package it is
built with, and whose binary is the desktop app. target/ is ignored.
