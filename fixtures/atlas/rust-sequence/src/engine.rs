pub struct Engine {
    pub name: String,
}

impl Engine {
    pub fn new(name: &str) -> Self {
        Engine { name: name.to_string() }
    }
}

pub fn run(engine: &Engine) {
    warm_up(engine);
    crate::telemetry::record("ran");
}

fn warm_up(_engine: &Engine) {}
