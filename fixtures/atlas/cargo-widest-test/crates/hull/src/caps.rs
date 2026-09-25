use schema::spec::default_spec;

pub fn cap() {
    let _ = default_spec();
}

#[cfg(test)]
mod tests {
    #[test]
    fn caps() {
        super::cap();
    }
}
