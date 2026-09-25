use std::path::Path;

pub fn save(dir: &Path) {
    std::fs::write(dir.join("settings.ron"), "settings").ok();
}
