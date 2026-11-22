//! End-to-end checks of the backend against the real tools on this machine:
//! SQLite, the PowerShell step runner, ffmpeg/ffprobe, the CSV topic pool and the library importer.
//! The real library / quotes files are only READ; everything written goes to a temp folder.

use mumucut_lib::models::*;
use mumucut_lib::state::AppState;
use mumucut_lib::{commands, db, ffcheck, runner};
use serde_json::json;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

fn step(key: &str, kind: &str, cmd: &str) -> StepDef {
    StepDef { key: key.into(), label: key.into(), kind: kind.into(), cmd: cmd.into(), ..Default::default() }
}

fn tmp() -> PathBuf {
    let p = std::env::temp_dir().join("mumucut_test");
    let _ = std::fs::remove_dir_all(&p);
    std::fs::create_dir_all(p.join("work")).unwrap();
    std::fs::create_dir_all(p.join("lib")).unwrap();
    p
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn full_flow_on_real_tools() {
    let t = tmp();
    let app = tauri::test::mock_app();
    let conn = db::open(&t.join("t.db")).unwrap();
    app.manage(AppState { db: Mutex::new(conn), running: Mutex::new(HashMap::new()), data_dir: t.clone() });
    let h = app.handle().clone();
    let st = app.state::<AppState>();

    // settings round trip + tool dirs
    commands::set_setting(app.state(), "ffmpeg_dir".into(), r"C:\Users\gnomerock\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0-full_build\bin".into()).unwrap();
    let fake_ai = t.join("fake_ai.cmd");
    std::fs::write(&fake_ai, "@echo off\r\necho ```json\r\necho {\"lines\":[{\"text\":\"one\"},{\"text\":\"two\"}],\"x\":1}\r\necho ```\r\n").unwrap();
    commands::set_setting(app.state(), "ai_cli_cmd".into(), fake_ai.to_string_lossy().to_string()).unwrap();
    assert_eq!(commands::get_settings(app.state()).unwrap().get("ai_provider"), None);

    let mut ai_script = step("script", "ai", r"if (-not (Test-Path popspec\{key}_text.json)) { exit 5 }");
    ai_script.prompt = "write a script for {key}".into();
    ai_script.output_file = "popspec/{key}_text.json".into();
    let mut ai_merge = step("compose", "ai", "");
    ai_merge.prompt = "layout for {key}".into();
    ai_merge.merge_into = "popspec/{key}_text.json".into();
    let mut gpu_a = step("gpu_a", "shell", "Start-Sleep -Seconds 4\nWrite-Output done_a");
    gpu_a.gpu = true;
    let mut gpu_b = step("gpu_b", "shell", "Write-Output done_b");
    gpu_b.gpu = true;
    let mut gated = step("gated", "shell", "Write-Output hello");
    gated.gate = true;

    let cfg = Config {
        lufs_min: -40.0,
        lufs_max: -5.0,
        peak_max: 0.0,
        pool: Pool {
            csv: r"D:\short-clips\dhamma-elders\01_content\quotes_candidates*.csv".into(),
            ref_col: 1,
            title_col: 3,
            brief_cols: vec![4, 5],
            used_col: 9,
            rating_col: 6,
            skip_rating: "ละเอียดอ่อน".into(),
            ref_prefix: "ธรรมบท คาถาที่ ".into(),
        },
        steps: vec![
            step("pick", "pick", ""),
            ai_script,
            ai_merge,
            step(
                "video",
                "shell",
                "New-Item -ItemType Directory -Force out | Out-Null\nffmpeg -y -loglevel error -f lavfi -i color=c=black:s=1080x1920:r=30:d=3 -f lavfi -i sine=frequency=440:sample_rate=48000:duration=3 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest out/{key}.mp4\nWrite-Output \"video for {key} ok\"",
            ),
            step("fail", "shell", "Write-Output before\ncmd /c exit 3\nWrite-Output never_reached"),
            step("long", "shell", "Start-Sleep -Seconds 40"),
            step("check", "check", ""),
            step("deliver", "deliver", ""),
            gpu_a,
            gpu_b,
            gated,
            step("manual", "manual", ""),
        ],
        ..Default::default()
    };
    let project = commands::save_project(
        app.state(),
        Project {
            id: 0,
            name: "test".into(),
            workdir: t.join("work").to_string_lossy().to_string(),
            library_dir: t.join("lib").to_string_lossy().to_string(),
            key_prefix: "EP".into(),
            config: serde_json::to_value(&cfg).unwrap(),
        },
    )
    .unwrap();
    let c1 = commands::create_clip(app.state(), project.id).unwrap();
    assert_eq!(c1.clip_key, "EP01");
    assert_eq!(commands::create_clip(app.state(), project.id).unwrap().clip_key, "EP02");
    let id = c1.id;

    // 1 pick: next unused verse from the real pool (read only)
    let r = runner::execute(&h, &st, id, "pick").await.unwrap();
    assert_eq!(r.status, "done", "pick log: {}", r.log);
    let clip = commands::get_clip_detail(app.state(), id).unwrap().clip;
    println!("picked: {} / {}", clip.ref_, clip.title);
    assert!(clip.ref_.starts_with("ธรรมบท คาถาที่ "));
    assert!(!clip.title.is_empty() && !clip.brief.is_empty());
    assert_eq!(clip.status, "making");
    // the same verse is never offered to a second clip
    let c2 = commands::list_clips(app.state(), Some(project.id)).unwrap().into_iter().find(|c| c.clip_key == "EP02").unwrap();
    let r2 = runner::execute(&h, &st, c2.id, "pick").await.unwrap();
    assert_eq!(r2.status, "done");
    let clip2 = commands::get_clip_detail(app.state(), c2.id).unwrap().clip;
    assert_ne!(clip.ref_, clip2.ref_, "duplicate verse picked");

    // 2 AI step through the CLI path: JSON extracted from fenced answer, file written, post-command ran
    let r = runner::execute(&h, &st, id, "script").await.unwrap();
    assert_eq!(r.status, "done", "script log: {}", r.log);
    let f = t.join("work").join("popspec").join("EP01_text.json");
    let j: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&f).unwrap()).unwrap();
    assert_eq!(j["lines"].as_array().unwrap().len(), 2);
    assert!(commands::get_clip_detail(app.state(), id).unwrap().clip.script.contains("\"lines\""));
    let r = runner::execute(&h, &st, id, "compose").await.unwrap();
    assert_eq!(r.status, "done", "compose log: {}", r.log);
    let j: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&f).unwrap()).unwrap();
    assert_eq!(j["x"], 1);

    // 3 shell step creates a real video with ffmpeg
    let r = runner::execute(&h, &st, id, "video").await.unwrap();
    assert_eq!(r.status, "done", "video log: {}", r.log);
    assert!(r.log.contains("video for EP01 ok"));
    assert!(t.join("work/out/EP01.mp4").is_file());

    // 4 failing command stops the script and reports the code
    let r = runner::execute(&h, &st, id, "fail").await.unwrap();
    assert_eq!(r.status, "failed");
    assert!(r.log.contains("before") && !r.log.contains("never_reached"), "log: {}", r.log);
    assert!(r.log.contains("รหัส 3"), "log: {}", r.log);

    // 5 file check with ffprobe + EBU R128
    let r = runner::execute(&h, &st, id, "check").await.unwrap();
    assert_eq!(r.status, "done", "check log: {}", r.log);
    let clip = commands::get_clip_detail(app.state(), id).unwrap().clip;
    println!("check log:\n{}", r.log);
    assert!((clip.duration.unwrap() - 3.0).abs() < 0.3);
    assert!(clip.lufs.is_some());
    // the real defaults must reject this clip (sine is too quiet, 3 s is fine)
    let strict = Config::default();
    let rep = ffcheck::check_video(&st, &t.join("work/out/EP01.mp4"), &strict).await.unwrap();
    assert!(!rep.ok);
    assert!(rep.items.iter().any(|i| i.name.contains("LUFS") && !i.ok));
    assert!(rep.items.iter().any(|i| i.name == "ขนาดภาพ" && i.ok));

    // 6 deliver to the library
    let r = runner::execute(&h, &st, id, "deliver").await.unwrap();
    assert_eq!(r.status, "done", "deliver log: {}", r.log);
    let clip = commands::get_clip_detail(app.state(), id).unwrap().clip;
    assert_eq!(clip.status, "ready");
    assert!(t.join("lib/EP01/EP01.mp4").is_file() && t.join("lib/EP01/meta.json").is_file());

    // 7 gate step waits for approval
    let r = runner::execute(&h, &st, id, "gated").await.unwrap();
    assert_eq!(r.status, "review");
    let r = commands::set_step_status(app.state(), id, "gated".into(), "done".into()).unwrap();
    assert_eq!(r.status, "done");
    // manual steps refuse to run
    let r = runner::execute(&h, &st, id, "manual").await.unwrap();
    assert_eq!(r.status, "failed");

    // 8 GPU guard: a second GPU step cannot start while the first one runs
    let (a, b) = tokio::join!(runner::execute(&h, &st, id, "gpu_a"), async {
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
        runner::execute(&h, &st, id, "gpu_b").await
    });
    assert_eq!(a.unwrap().status, "done");
    let e = b.err().expect("second GPU step must be refused");
    assert!(e.contains("การ์ดจอ"), "{e}");

    // 9 cancel kills the whole process tree
    let started = std::time::Instant::now();
    let (r, ()) = tokio::join!(runner::execute(&h, &st, id, "long"), async {
        tokio::time::sleep(std::time::Duration::from_millis(2500)).await;
        assert!(commands::cancel_step(app.state(), id, "long".into()).unwrap());
    });
    assert_eq!(r.unwrap().status, "failed");
    assert!(started.elapsed().as_secs() < 20, "cancel too slow: {:?}", started.elapsed());

    // 10 posts: no duplicate per platform, status follows
    commands::add_post(app.state(), id, "facebook".into(), "2026-11-23 07:00".into(), "".into(), "".into()).unwrap();
    let dup = commands::add_post(app.state(), id, "facebook".into(), "2026-11-24 07:00".into(), "".into(), "".into());
    assert!(dup.is_err());
    let clip = commands::get_clip_detail(app.state(), id).unwrap().clip;
    assert_eq!(clip.status, "scheduled");

    // 11 import the REAL library (read only) into a second project
    let p2 = commands::save_project(
        app.state(),
        Project {
            id: 0,
            name: "imported".into(),
            workdir: t.join("work").to_string_lossy().to_string(),
            library_dir: r"D:\short-clips\library\dhamma".into(),
            key_prefix: "EP".into(),
            config: json!({ "steps": [{"key":"a","label":"a","kind":"shell"},{"key":"post","label":"post","kind":"post"}] }),
        },
    )
    .unwrap();
    let n = commands::import_library(app.state(), p2.id).unwrap();
    println!("imported {n} clips from the real library");
    assert!(n >= 6);
    let ep16 = commands::list_clips(app.state(), Some(p2.id)).unwrap().into_iter().find(|c| c.clip_key == "EP16").unwrap();
    assert_eq!(ep16.title, "ดัดใจให้ตรง");
    assert!((ep16.duration.unwrap() - 26.97).abs() < 0.05);
    assert!(ep16.caption.contains("ใจเรากวัดแกว่ง"));
    // importing twice adds nothing
    assert_eq!(commands::import_library(app.state(), p2.id).unwrap(), 0);
    // and the real EP16 file passes the same checker the app uses (read only)
    let real = std::path::Path::new(ep16.video_path.as_deref().unwrap());
    let rep = ffcheck::check_video(&st, real, &Config { lufs_min: -16.5, lufs_max: -13.0, peak_max: -1.0, ..Default::default() }).await.unwrap();
    println!("real EP16 check: ok={} lufs={:?} peak={:?} dur={:.1}", rep.ok, rep.lufs, rep.peak, rep.duration);
    assert!(rep.items.iter().find(|i| i.name == "ขนาดภาพ").unwrap().ok);
}

