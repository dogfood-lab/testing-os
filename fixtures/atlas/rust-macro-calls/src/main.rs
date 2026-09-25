mod config;
mod engine;
mod render;

use render::draw;

fn main() {
    println!("{}", config::load());
    assert!(engine::run());
    let frames = vec![draw()];
    println!("{}", frames.len().to_string());
}
