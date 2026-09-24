mod config;
mod render;

use forge::engine::{self, Engine};
use crate::render::draw;

fn main() {
    let settings = config::load();
    if settings.help {
        config::usage();
        return;
    }
    let engine = Engine::new(&settings.name);
    prepare();
    engine::run(&engine);
    draw(&engine);
}

fn prepare() {
    config::validate();
}
