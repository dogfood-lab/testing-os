mod extra;

pub fn half(n: u32) -> u32 {
    extra::divide(n, 2)
}

#[cfg(test)]
mod tests {
    use super::half;

    #[tokio::test]
    async fn halves() {
        assert_eq!(half(4), 2);
    }
}
