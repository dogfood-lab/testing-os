use forge::names;
use std::fs;
use std::path::Path;

fn main() {
    let out_dir = Path::new("output");
    fs::create_dir_all(out_dir).expect("output dir");
    for name in names() {
        let path = out_dir.join(format!("{name}.glb"));
        fs::write(&path, b"glb").expect("write");
    }
}
