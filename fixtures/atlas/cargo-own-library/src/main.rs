use mile_game::turn::play;
use mile_game::world::World;

fn main() {
    let world = World::new();
    play(&world);
}
