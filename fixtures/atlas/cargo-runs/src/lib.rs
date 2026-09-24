pub fn run() {
    println!("{}", tally_core::add(2, 3));
}

#[cfg(test)]
mod tests {
    #[test]
    fn runs() {
        super::run();
    }
}
