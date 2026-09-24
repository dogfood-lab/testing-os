pub mod engine;
pub mod rules;

mod inner {
    pub mod deep {
        pub fn below() {}
    }
}

pub use inner::deep;
