pub fn prepare(app: &tauri::AppHandle) {
    let dir = app.path().app_data_dir().expect("app data dir");
    std::fs::create_dir_all(&dir).ok();
}
