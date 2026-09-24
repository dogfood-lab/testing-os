pub fn greet() -> &'static str {
    "hello"
}

#[cfg(test)]
mod tests {
    #[test]
    fn greets() {
        assert_eq!(super::greet(), "hello");
    }
}
