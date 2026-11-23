//! Real-machine checks of the provider panel: tool/skill detection and the ComfyUI MCP handshake.
//! Run with: cargo test --test providers -- --ignored --nocapture

use mumucut_lib::state::AppState;
use mumucut_lib::{commands, db, providers};
use tauri::Manager;

#[test]
fn split_cmd_keeps_quoted_words() {
    assert_eq!(providers::split_cmd("npx -y comfyui-mcp"), vec!["npx", "-y", "comfyui-mcp"]);
    assert_eq!(providers::split_cmd(r#""C:\Program Files\x.exe" --a "b c""#), vec![r"C:\Program Files\x.exe", "--a", "b c"]);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore]
async fn real_status_and_comfy_mcp() {
    let t = std::env::temp_dir().join("mumucut_prov_test");
    let _ = std::fs::remove_dir_all(&t);
    std::fs::create_dir_all(&t).unwrap();
    let app = tauri::test::mock_app();
    app.manage(AppState::new(db::open(&t.join("t.db")).unwrap(), t.clone()));
    commands::set_setting(app.state(), "node_dir".into(), r"C:\Users\gnomerock\AppData\Roaming\fnm\node-versions\v24.13.0\installation".into()).unwrap();
    for s in providers::provider_status(app.state(), None).await.unwrap() {
        println!("{:<20} ok={:<5} {} {}", s.id, s.ok, s.version, s.detail);
    }
    // MCP config entry only when switched on
    assert!(providers::comfy_mcp_server(&app.state::<AppState>()).is_none());
    commands::set_setting(app.state(), "comfy_mcp_enabled".into(), "1".into()).unwrap();
    println!("mcp entry: {}", providers::comfy_mcp_server(&app.state::<AppState>()).unwrap());
    println!("comfy mcp test (default, not installed globally): {:?}", providers::test_comfy_mcp(app.state()).await);
    // a local install made for this test (npm install --prefix %TEMP%\cmcp_test comfyui-mcp)
    let local = std::env::temp_dir().join("cmcp_test").join("node_modules").join(".bin").join("comfyui-mcp.cmd");
    if local.is_file() {
        commands::set_setting(app.state(), "comfy_mcp_preset".into(), "custom".into()).unwrap();
        commands::set_setting(app.state(), "comfy_mcp_cmd".into(), format!("\"{}\"", local.display())).unwrap();
        let r = providers::test_comfy_mcp(app.state()).await;
        println!("comfy mcp test (local install): {r:?}");
        assert!(r.unwrap().contains("comfyui-mcp"));
    }
}
