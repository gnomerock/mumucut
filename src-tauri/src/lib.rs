pub mod ai;
pub mod commands;
pub mod db;
pub mod ffcheck;
pub mod flow;
pub mod library;
pub mod models;
pub mod providers;
pub mod runner;
pub mod state;
pub mod util;


use state::AppState;
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
            app.manage(AppState::new(conn, dir));
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(flow::start_server(handle)).expect("start local tool server");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::set_setting,
            commands::list_agents,
            commands::save_agent,
            commands::delete_agent,
            commands::set_default_agent,
            commands::set_agent_key,
            commands::clear_agent_key,
            commands::test_agent,
            commands::run_flow,
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
            library::list_assets,
            library::add_assets,
            library::update_asset,
            library::delete_asset,
            library::use_library_asset,
            library::share_asset,
            library::generate_asset,
            library::list_affiliates,
            library::save_affiliate,
            library::delete_affiliate,
            library::list_clip_affiliates,
            library::attach_affiliate,
            library::detach_affiliate,
            library::list_accounts,
            library::save_account,
            library::delete_account,
            library::set_account_token,
            library::clear_account_token,
            library::open_studio,
            library::ai_write,
            library::ensure_dir,
            providers::provider_status,
            providers::set_provider_key,
            providers::clear_provider_key,
            providers::run_installer,
            providers::test_comfy_mcp,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MumuCut");
}

