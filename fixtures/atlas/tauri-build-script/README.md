# tauri-build-script

An Atlas fixture for a Tauri crate's build script, the shape commandui's
desktop app has. app/src-tauri/build.rs runs tauri_build::build(), which
writes the capability schemas under gen/schemas/ on every build of the
crate; the repository tracks them. The desktop workflow builds the app with
the Tauri CLI, and CI runs cargo check on the crate; both run the build
script.
