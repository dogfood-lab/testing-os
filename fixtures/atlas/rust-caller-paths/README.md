# rust-caller-paths

An Atlas fixture for Rust writes rooted at a caller's place through a field
and a parameter, the shape saints-mile has. main builds save_dir from the
directory it is run in and hands it to Store::new, which keeps it in a
field that Store::save writes under, and to settings::save, which writes
under its parameter. desktop.rs makes the app's data directory, which
Tauri's path resolver names. None of these is a place of this repository.
