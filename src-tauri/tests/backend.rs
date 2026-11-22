//! End-to-end checks of the backend against the real tools on this machine:
//! SQLite, the PowerShell step runner, ffmpeg/ffprobe, the CSV topic pool and the library importer.
//! The real library / quotes files are only READ; everything written goes to a temp folder.

use mumucut_lib::models::*;
use mumucut_lib::state::AppState;
use mumucut_lib::{commands, db, ffcheck, flow, runner};
use serde_json::json;
use std::path::PathBuf;
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
    app.manage(AppState::new(conn, t.clone()));
    let h = app.handle().clone();
    let st = app.state::<AppState>();

    // settings round trip + tool dirs
    commands::set_setting(app.state(), "ffmpeg_dir".into(), r"C:\Users\gnomerock\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0-full_build\bin".into()).unwrap();
    let fake_ai = t.join("fake_ai.cmd");
    std::fs::write(&fake_ai, "@echo off\r\necho ```json\r\necho {\"lines\":[{\"text\":\"one\"},{\"text\":\"two\"}],\"x\":1}\r\necho ```\r\n").unwrap();
    // first start seeds one default agent (Claude Code); turn it into a fake CLI agent for the test
    let seeded = commands::list_agents(app.state()).unwrap();
    assert_eq!(seeded.len(), 1);
    assert!(seeded[0].is_default && seeded[0].provider == "claude");
    let mut fake = seeded[0].clone();
    fake.provider = "custom".into();
    fake.command = fake_ai.to_string_lossy().to_string();
    let fake = commands::save_agent(app.state(), fake).unwrap();
    assert!(fake.is_default);
    // validation: an API agent without a model, a bad model name and a custom agent without a command are refused
    let mut bad = fake.clone();
    bad.id = 0;
    bad.provider = "openai-api".into();
    bad.model = String::new();
    assert!(commands::save_agent(app.state(), bad.clone()).is_err());
    bad.provider = "claude".into();
    bad.model = "x; calc".into();
    assert!(commands::save_agent(app.state(), bad.clone()).is_err());
    bad.provider = "custom".into();
    bad.model = String::new();
    bad.command = String::new();
    assert!(commands::save_agent(app.state(), bad).is_err());
    // the last agent cannot be deleted
    assert!(commands::delete_agent(app.state(), fake.id).is_err());

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



// ---------------------------------------------------------------- command lines of the providers

#[test]
fn provider_command_lines() {
    use mumucut_lib::ai;
    let mut a = Agent { name: "x".into(), provider: "claude".into(), ..Default::default() };
    let c = ai::cli_command(&a).unwrap();
    assert!(c.starts_with("claude -p ") && c.contains("--tools \"\"") && c.contains("--no-session-persistence"));
    a.model = "claude-haiku-5-5".into();
    a.effort = "low".into();
    let c = ai::cli_command(&a).unwrap();
    assert!(c.ends_with("--model claude-haiku-5-5 --effort low"), "{c}");
    a.provider = "codex".into();
    a.model = "gpt-5".into();
    assert_eq!(ai::cli_command(&a).unwrap(), "codex exec --skip-git-repo-check --ephemeral -s read-only -m gpt-5");
    a.provider = "custom".into();
    a.command = "  mytool --flag  ".into();
    assert_eq!(ai::cli_command(&a).unwrap(), "mytool --flag");
    a.provider = "anthropic-api".into();
    assert!(ai::cli_command(&a).is_err());
    a.instructions = "Be brief.".into();
    assert_eq!(ai::compose_prompt(&a, "Q"), "Be brief.\n\n---\n\nQ");
    // stream lines of the Claude CLI turn into log lines
    let l = flow::describe_stream_line(r#"{"type":"assistant","message":{"content":[{"type":"text","text":"hi"},{"type":"tool_use","name":"mcp__mumucut__run_step","input":{"step":"voice"}}]}}"#);
    assert_eq!(l, vec![("agent".to_string(), "hi".to_string()), ("info".to_string(), "เรียก run_step voice".to_string())]);
    assert!(flow::describe_stream_line(r#"{"type":"system","subtype":"init"}"#).is_empty());
    assert_eq!(flow::describe_stream_line("plain text")[0].1, "plain text");
    // the agent may only reach files inside the project folder
    assert!(flow::scoped("D:/w", "a/b.json").is_ok());
    for bad in ["../x", "a/../../x", "C:/x", "/x", "", "a/..\\..\\x"] {
        assert!(flow::scoped("D:/w", bad).is_err(), "{bad}");
    }
}

// ---------------------------------------------------------------- an agent runs the flow through the tool server

const FAKE_AGENT: &str = r#"$ErrorActionPreference = 'Stop'
$url = $env:MUMUCUT_MCP_URL; $tok = $env:MUMUCUT_MCP_TOKEN
$script:id = 0
function Rpc($method, $params, $token = $tok) {
  $script:id++
  $body = @{ jsonrpc = '2.0'; id = $script:id; method = $method; params = $params } | ConvertTo-Json -Depth 20 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($body)
  return Invoke-RestMethod -Uri $url -Method Post -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json; charset=utf-8' -Body $bytes
}
function Tool($name, $arguments) { return (Rpc 'tools/call' @{ name = $name; arguments = $arguments }).result }
function Say($s) { [Console]::Out.WriteLine($s) }
$init = Rpc 'initialize' @{ protocolVersion = '2025-03-26'; capabilities = @{}; clientInfo = @{ name = 'fake'; version = '1' } }
if ($init.result.serverInfo.name -eq 'mumucut') { Say 'OK initialize' } else { Say 'BAD initialize' }
$tools = (Rpc 'tools/list' @{}).result.tools
if ($tools.Count -eq 7) { Say 'OK tools_7' } else { Say "BAD tools $($tools.Count)" }
$ctx = Tool 'get_context' @{}
if ($ctx.content[0].text -match '"key": "EP01"' -and $ctx.content[0].text -match 'write a script') { Say 'OK context_with_prompt' } else { Say 'BAD context' }
$r = Tool 'run_step' @{ step = 'video' }
if ($r.isError -and $r.content[0].text -match 'script') { Say 'OK order_enforced' } else { Say 'BAD order' }
$r = Tool 'run_step' @{ step = 'script' }
if ($r.isError) { Say 'OK ai_needs_submit' } else { Say 'BAD ai_run' }
$r = Tool 'submit_step' @{ step = 'script'; content = '```json' + "`n" + '{"lines":[{"text":"hello"}]}' + "`n" + '```' }
if (-not $r.isError -and $r.content[0].text -match 'done') { Say 'OK submitted' } else { Say "BAD submit $($r.content[0].text)" }
$r = Tool 'run_step' @{ step = 'video' }
if (-not $r.isError -and $r.content[0].text -match 'video ok') { Say 'OK ran_shell' } else { Say "BAD run $($r.content[0].text)" }
$r = Tool 'run_step' @{ step = 'gated' }
if ($r.content[0].text -match 'review') { Say 'OK gate_review' } else { Say 'BAD gate' }
$r = Tool 'run_step' @{ step = 'after' }
if ($r.isError -and $r.content[0].text -match 'review') { Say 'OK gate_blocks_next' } else { Say "BAD gate_next $($r.content[0].text)" }
$r = Tool 'run_step' @{ step = 'human' }
if ($r.isError) { Say 'OK manual_refused' } else { Say 'BAD manual' }
$r = Tool 'write_file' @{ path = '../evil.txt'; content = 'x' }
if ($r.isError) { Say 'OK scope_write' } else { Say 'BAD scope_write' }
$r = Tool 'read_file' @{ path = 'C:/Windows/win.ini' }
if ($r.isError) { Say 'OK scope_read' } else { Say 'BAD scope_read' }
$r = Tool 'write_file' @{ path = 'notes/a.txt'; content = 'hello' }
if (-not $r.isError) { Say 'OK write_inside' } else { Say 'BAD write_inside' }
$r = Tool 'update_clip' @{ title = 'agent title' }
if (-not $r.isError) { Say 'OK update_clip' }
try { Rpc 'tools/list' @{} 'wrong-token' | Out-Null; Say 'BAD token_accepted' } catch { Say 'OK bad_token_rejected' }
Say 'finished'
"#;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn flow_agent_drives_the_flow_through_the_tool_server() {
    let t = std::env::temp_dir().join("mumucut_flow_test");
    let _ = std::fs::remove_dir_all(&t);
    std::fs::create_dir_all(t.join("work")).unwrap();
    let app = tauri::test::mock_app();
    app.manage(AppState::new(db::open(&t.join("t.db")).unwrap(), t.clone()));
    let h = app.handle().clone();
    let port = flow::start_server(h.clone()).await.unwrap();
    assert!(port > 0);

    // the fake agent is a CLI that talks to the tool server (UTF-8 BOM so Windows PowerShell reads it right)
    let script = t.join("fake_agent.ps1");
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(FAKE_AGENT.as_bytes());
    std::fs::write(&script, bytes).unwrap();
    let seeded = commands::list_agents(app.state()).unwrap();
    let mut agent = seeded[0].clone();
    agent.provider = "custom".into();
    agent.command = format!("powershell -NoProfile -ExecutionPolicy Bypass -File \"{}\"", script.display());
    commands::save_agent(app.state(), agent).unwrap();

    let mut script_step = step("script", "ai", "");
    script_step.prompt = "write a script for {key}".into();
    script_step.output_file = "popspec/{key}.json".into();
    let mut gated = step("gated", "shell", "Write-Output gate_ran");
    gated.gate = true;
    let cfg = Config {
        run_mode: "agent".into(),
        steps: vec![
            script_step,
            step("video", "shell", "New-Item -ItemType Directory -Force out | Out-Null\nSet-Content out/{key}.txt 'x'\nWrite-Output 'video ok'"),
            gated,
            step("after", "shell", "Write-Output after_ran"),
            step("human", "manual", ""),
        ],
        ..Default::default()
    };
    let project = commands::save_project(
        app.state(),
        Project { id: 0, name: "flow".into(), workdir: t.join("work").to_string_lossy().to_string(), library_dir: t.join("lib").to_string_lossy().to_string(), key_prefix: "EP".into(), config: serde_json::to_value(&cfg).unwrap() },
    )
    .unwrap();
    let clip = commands::create_clip(app.state(), project.id).unwrap();

    let st = app.state::<AppState>();
    let out = flow::run_flow(&h, &st, clip.id).await.unwrap();
    assert_eq!(out, "agent จบการทำงาน");
    let d = commands::get_clip_detail(app.state(), clip.id).unwrap();
    let flow_row = d.steps.iter().find(|s| s.step_key == "__flow__").unwrap();
    println!("flow log:\n{}", flow_row.log);
    assert_eq!(flow_row.status, "done");
    for ok in ["initialize", "tools_7", "context_with_prompt", "order_enforced", "ai_needs_submit", "submitted", "ran_shell", "gate_review", "gate_blocks_next", "manual_refused", "scope_write", "scope_read", "write_inside", "update_clip", "bad_token_rejected"] {
        assert!(flow_row.log.contains(&format!("OK {ok}")), "missing OK {ok} in:\n{}", flow_row.log);
    }
    assert!(!flow_row.log.contains("BAD"), "{}", flow_row.log);

    // what the agent did is really in the app
    let status = |k: &str| d.steps.iter().find(|s| s.step_key == k).map(|s| s.status.clone()).unwrap_or_default();
    assert_eq!(status("script"), "done");
    assert_eq!(status("video"), "done");
    assert_eq!(status("gated"), "review", "the gate must wait for a person");
    assert_eq!(status("after"), "");
    assert!(d.clip.script.contains("\"hello\""));
    assert_eq!(d.clip.title, "agent title");
    assert!(t.join("work/out/EP01.txt").is_file());
    assert!(t.join("work/popspec/EP01.json").is_file());
    assert!(t.join("work/notes/a.txt").is_file());
    assert!(!t.join("evil.txt").exists(), "the agent escaped the project folder");
    // the run is over: its token no longer works and nothing is left running
    assert!(st.flows.lock().unwrap().is_empty());
    assert!(st.running.lock().unwrap().is_empty());
    // an API agent cannot run the flow
    let mut api = commands::list_agents(app.state()).unwrap()[0].clone();
    api.provider = "anthropic-api".into();
    commands::save_agent(app.state(), api).unwrap();
    let e = flow::run_flow(&h, &st, clip.id).await.unwrap_err();
    assert!(e.contains("คุม flow ไม่ได้"), "{e}");
}

// ---------------------------------------------------------------- the real Claude Code as flow agent (costs a few calls: run on purpose)

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore]
async fn live_claude_runs_a_small_flow() {
    let t = std::env::temp_dir().join("mumucut_live_test");
    let _ = std::fs::remove_dir_all(&t);
    std::fs::create_dir_all(t.join("work")).unwrap();
    let app = tauri::test::mock_app();
    app.manage(AppState::new(db::open(&t.join("t.db")).unwrap(), t.clone()));
    let h = app.handle().clone();
    flow::start_server(h.clone()).await.unwrap();
    let mut agent = commands::list_agents(app.state()).unwrap()[0].clone();
    agent.model = "claude-haiku-5-5".into();
    agent.effort = "low".into();
    commands::save_agent(app.state(), agent).unwrap();

    let mut s1 = step("script", "ai", "");
    s1.prompt = "Write a two line greeting script for clip {key} as JSON exactly like {\"lines\":[{\"text\":\"line one\"},{\"text\":\"line two\"}]}".into();
    s1.output_file = "popspec/{key}.json".into();
    let mut s3 = step("review", "shell", "Write-Output 'needs a person'");
    s3.gate = true;
    let cfg = Config {
        steps: vec![s1, step("make", "shell", "New-Item -ItemType Directory -Force out | Out-Null\nSet-Content out/{key}.txt 'made'\nWrite-Output 'made ok'"), s3, step("last", "shell", "Write-Output never")],
        ..Default::default()
    };
    let project = commands::save_project(
        app.state(),
        Project { id: 0, name: "live".into(), workdir: t.join("work").to_string_lossy().to_string(), library_dir: String::new(), key_prefix: "EP".into(), config: serde_json::to_value(&cfg).unwrap() },
    )
    .unwrap();
    let clip = commands::create_clip(app.state(), project.id).unwrap();
    let st = app.state::<AppState>();
    let r = flow::run_flow(&h, &st, clip.id).await;
    let d = commands::get_clip_detail(app.state(), clip.id).unwrap();
    let log = d.steps.iter().find(|s| s.step_key == "__flow__").map(|s| s.log.clone()).unwrap_or_default();
    println!("RESULT {r:?}\nLOG:\n{log}");
    let status = |k: &str| d.steps.iter().find(|s| s.step_key == k).map(|s| s.status.clone()).unwrap_or_default();
    println!("script={} make={} review={} last={}", status("script"), status("make"), status("review"), status("last"));
    assert!(r.is_ok(), "{r:?}");
    assert_eq!(status("script"), "done");
    assert_eq!(status("make"), "done");
    assert_eq!(status("review"), "review");
    assert_eq!(status("last"), "");
}
