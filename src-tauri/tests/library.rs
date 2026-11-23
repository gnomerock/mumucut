//! Checks of the shared libraries: assets, affiliate links, social accounts and the AI asset command.
//! Everything is written to a temp folder.

use mumucut_lib::models::*;
use mumucut_lib::state::AppState;
use mumucut_lib::{commands, db, library};
use tauri::Manager;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn libraries_round_trip() {
    let t = std::env::temp_dir().join("mumucut_lib_test");
    let _ = std::fs::remove_dir_all(&t);
    std::fs::create_dir_all(t.join("work")).unwrap();
    let app = tauri::test::mock_app();
    app.manage(AppState::new(db::open(&t.join("t.db")).unwrap(), t.clone()));

    let cfg = Config { renderer: "hyperframes".into(), description: "ทดสอบ".into(), ..Default::default() };
    let ch = commands::save_project(
        app.state(),
        Project { id: 0, name: "ช่องทดสอบ".into(), workdir: t.join("work").to_string_lossy().to_string(), library_dir: String::new(), key_prefix: "T".into(), config: serde_json::to_value(&cfg).unwrap() },
    )
    .unwrap();
    let back: Config = serde_json::from_value(ch.config.clone()).unwrap();
    assert_eq!(back.renderer, "hyperframes");
    assert_eq!(library::studio_command(&back).unwrap(), "npx hyperframes preview");
    let other = commands::save_project(app.state(), Project { id: 0, name: "อีกช่อง".into(), config: serde_json::to_value(Config::default()).unwrap(), ..ch.clone() }).unwrap();
    let clip = commands::create_clip(app.state(), ch.id).unwrap();

    // assets: library (channel + shared), clip assets, use/share
    let img = t.join("a.png");
    std::fs::write(&img, b"png").unwrap();
    let wav = t.join("b.wav");
    std::fs::write(&wav, b"wav").unwrap();
    let added = library::add_assets(app.state(), vec![img.to_string_lossy().into()], Some(ch.id), None).unwrap();
    assert_eq!(added[0].kind, "image");
    library::add_assets(app.state(), vec![wav.to_string_lossy().into()], None, None).unwrap();
    assert!(library::add_assets(app.state(), vec![t.join("missing.png").to_string_lossy().into()], None, None).is_err());
    assert_eq!(library::list_assets(app.state(), Some(ch.id), None).unwrap().len(), 2);
    assert_eq!(library::list_assets(app.state(), Some(other.id), None).unwrap().len(), 1, "other channel sees only shared items");
    let used = library::use_library_asset(app.state(), added[0].id, clip.id).unwrap();
    assert_eq!(used.source, "library");
    assert!(library::use_library_asset(app.state(), added[0].id, clip.id).is_err(), "no duplicate in a clip");
    assert_eq!(library::list_assets(app.state(), Some(ch.id), Some(clip.id)).unwrap().len(), 1);
    assert!(library::share_asset(app.state(), used.id).is_err(), "already in the library");

    // AI asset command: needs a setting, then must write {out}
    assert!(library::generate_asset(app.state(), Some(ch.id), Some(clip.id), "image".into(), "lotus".into()).await.is_err());
    commands::set_setting(app.state(), "gen_image_cmd".into(), "Set-Content -Path \"{out}\" -Value $env:MUMU_PROMPT\nWrite-Output {prompt}".into()).unwrap();
    let gen = library::generate_asset(app.state(), Some(ch.id), Some(clip.id), "image".into(), "it's a lotus".into()).await.unwrap();
    assert_eq!(gen.source, "ai");
    assert!(gen.path.contains("assets"));
    assert_eq!(std::fs::read_to_string(&gen.path).unwrap().trim(), "it's a lotus");
    commands::set_setting(app.state(), "gen_audio_cmd".into(), "Write-Output nothing".into()).unwrap();
    assert!(library::generate_asset(app.state(), None, None, "audio".into(), "x".into()).await.is_err(), "no file written");

    // affiliate links
    let bad = AffiliateLink { url: "shopee.co.th/x".into(), ..Default::default() };
    assert!(library::save_affiliate(app.state(), bad).is_err());
    let l = library::save_affiliate(app.state(), AffiliateLink { url: "https://s.shopee.co.th/x".into(), platform: "shopee".into(), title: "หนังสือ".into(), ..Default::default() }).unwrap();
    library::attach_affiliate(app.state(), clip.id, l.id, "facebook".into()).unwrap();
    library::attach_affiliate(app.state(), clip.id, l.id, "facebook,youtube".into()).unwrap();
    let ca = library::list_clip_affiliates(app.state(), clip.id).unwrap();
    assert_eq!(ca.len(), 1);
    assert_eq!(ca[0].placement, "facebook,youtube");
    assert_eq!(library::list_affiliates(app.state(), None).unwrap()[0].used, 1);
    library::detach_affiliate(app.state(), clip.id, l.id).unwrap();
    assert!(library::list_clip_affiliates(app.state(), clip.id).unwrap().is_empty());

    // social accounts
    assert!(library::save_account(app.state(), SocialAccount { platform: "myspace".into(), name: "x".into(), ..Default::default() }).is_err());
    let acc = library::save_account(app.state(), SocialAccount { platform: "tiktok".into(), name: "ช่องทดสอบ".into(), channel_id: Some(ch.id), ..Default::default() }).unwrap();
    assert_eq!(library::list_accounts(app.state(), Some(ch.id)).unwrap().len(), 1);
    assert!(library::list_accounts(app.state(), Some(other.id)).unwrap().is_empty());
    library::delete_account(app.state(), acc.id).unwrap();

    // deleting a channel removes its assets and keeps shared ones
    commands::delete_project(app.state(), ch.id).unwrap();
    let left = library::list_assets(app.state(), None, None).unwrap();
    assert_eq!(left.len(), 1);
    assert_eq!(left[0].kind, "audio");
}
