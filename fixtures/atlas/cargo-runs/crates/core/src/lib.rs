mod util;

pub fn add(a: i32, b: i32) -> i32 {
    util::sum(&[a, b])
}

#[cfg(test)]
mod tests {
    #[test]
    fn adds() {
        assert_eq!(super::add(2, 2), 4);
    }
}
