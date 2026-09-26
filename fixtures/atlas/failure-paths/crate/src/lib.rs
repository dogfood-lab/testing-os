pub fn parse(text: &str) -> Result<u32, String> {
    match text.parse::<u32>() {
        Ok(value) => Ok(value),
        Err(error) => Err(error.to_string()),
    }
}
