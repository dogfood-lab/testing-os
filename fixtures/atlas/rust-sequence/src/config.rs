pub struct Settings {
    pub help: bool,
    pub name: String,
}

pub fn load() -> Settings {
    Settings { help: false, name: String::from("forge") }
}

pub fn usage() {
    println!("forge [--help]");
}

pub fn validate() {}
