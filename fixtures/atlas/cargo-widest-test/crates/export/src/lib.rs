use hull::generate::generate;
use schema::spec::Spec;

pub fn export(spec: &Spec) {
    generate(spec);
}
