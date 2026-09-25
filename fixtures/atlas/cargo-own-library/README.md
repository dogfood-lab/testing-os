# cargo-own-library

An Atlas fixture for where to start reading a Rust binary that uses its own
package's library, the shape saints-mile and commandui's desktop app have.
src/main.rs uses mile_game::turn and mile_game::world, which go through the
library's root, src/lib.rs, a list of modules. src/turn.rs goes on into the
engine crate; src/world.rs stays in the game.
