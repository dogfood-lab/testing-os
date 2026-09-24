mod commands;

pub fn run() {
    commands::greet();
}

#[cfg(test)]
mod tests {
    #[test]
    fn runs() {
        super::run();
    }
}
