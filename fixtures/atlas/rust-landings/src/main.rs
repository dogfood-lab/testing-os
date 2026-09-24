use clap::Parser;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Parser)]
struct Args {
    #[arg(long)]
    out: PathBuf,
}

const REPORT: &str = "reports/summary.txt";

fn main() {
    let args = Args::parse();
    fs::write(REPORT, "total").unwrap();
    let data = Path::new(env!("CARGO_MANIFEST_DIR")).join("data");
    let rates = fs::read_to_string(data.join("rates.csv")).unwrap();
    std::fs::File::create(args.out.join("ledger.json")).unwrap();
    let home = dirs::home_dir().unwrap();
    fs::write(home.join(".ledger"), &rates).unwrap();
    let cwd = std::env::current_dir().unwrap();
    fs::create_dir_all(cwd.join("cache")).unwrap();
    let dir = std::env::var("LEDGER_DIR").unwrap();
    fs::write(Path::new(&dir).join("mirror.csv"), &rates).unwrap();
    save(&PathBuf::from("snapshots"));
    fs::write(format!("{}/copy.csv", label()), &rates).unwrap();
}

fn save(dir: &Path) {
    fs::write(dir.join("state.ron"), "()").unwrap();
}

fn label() -> String {
    String::from("copies")
}

#[cfg(test)]
mod tests {
    #[test]
    fn writes_a_scratch_file() {
        std::fs::write("reports/scratch.txt", "x").unwrap();
    }
}
