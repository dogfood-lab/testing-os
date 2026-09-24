mod combat;
mod ui;
#[path = "platform/unix.rs"]
mod platform;

use mile_core::engine::{self, Engine};
use mile_game::prelude::*;
use serde::Deserialize;
use rand::Rng;
use std::fs;

const MAP: &str = include_str!("../assets/map.txt");

fn main() {
    combat::fight();
    ui::draw();
    println!("{}", crate::platform::name());
    mile_core::rules::apply();
    let _ = Engine::new();
    hello();
}
