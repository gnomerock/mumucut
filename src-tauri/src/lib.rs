pub mod ai;
pub mod commands;
pub mod db;
pub mod ffcheck;
pub mod models;
pub mod runner;
pub mod state;
pub mod util;


use state::AppState;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let dir = app.path().app_data_dir().expect("app data dir");
            std::fs::create_dir_all(&dir).expect("create app data dir");
            let conn = db::open(&dir.join("mumucut.db")).expect("open sqlite");
            app.manage(AppState {
                db: Mutex::new(conn),
                running: Mutex::new(HashMap::new()),
                data_dir: dir,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::set_setting,
            commands::set_api_key,
            commands::has_api_key,
            commands::clear_api_key,
            commands::check_tools,
            commands::list_projects,
            commands::save_project,
            commands::delete_project,
            commands::list_clips,
            commands::get_clip_detail,
            commands::create_clip,
            commands::update_clip,
            commands::delete_clip,
            commands::import_library,
            commands::run_step,
            commands::cancel_step,
            commands::set_step_status,
            commands::reset_steps,
            commands::running_steps,
            commands::list_posts,
            commands::add_post,
            commands::update_post,
            commands::delete_post,
            commands::get_stats,
            commands::read_text_file,
            commands::write_text_file,
            commands::path_exists,
            commands::resolve_project_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MumuCut");
}

