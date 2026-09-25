use tool::settings;
use tool::store::Store;

fn main() {
    let save_dir = std::env::current_dir().unwrap().join("saves");
    let store = Store::new(save_dir.clone());
    store.save("slot1");
    settings::save(&save_dir);
}
