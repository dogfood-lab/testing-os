use export::export;
use hull::generate::generate;
use schema::spec::default_spec;
use testkit::fixture;

#[test]
fn family() {
    let spec = default_spec();
    generate(&spec);
    export(&spec);
    assert_eq!(fixture(), 1);
}
