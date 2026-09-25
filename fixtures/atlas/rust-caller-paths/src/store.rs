use std::path::PathBuf;

pub struct Store {
    save_dir: PathBuf,
}

impl Store {
    pub fn new(save_dir: PathBuf) -> Self {
        Self { save_dir }
    }

    pub fn save(&self, slot: &str) {
        std::fs::create_dir_all(&self.save_dir).ok();
        std::fs::write(self.save_dir.join(format!("{slot}.ron")), "state").ok();
    }
}
