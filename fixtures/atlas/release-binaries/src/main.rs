use mile::play;

fn main() {
    play();
    std::fs::write("notes/last-run.txt", "played").ok();
}
