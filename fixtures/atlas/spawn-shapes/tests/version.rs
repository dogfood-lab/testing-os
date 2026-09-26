use std::process::Command;

#[test]
fn prints_its_version() {
    let output = Command::new(env!("CARGO_BIN_EXE_four")).output().unwrap();
    assert!(String::from_utf8_lossy(&output.stdout).starts_with("four"));
}
