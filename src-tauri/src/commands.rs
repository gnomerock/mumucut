use crate::models::*;
use crate::state::{hide_window, AppState};
use crate::util::*;
use crate::{ai, db, runner};
use rusqlite::params;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use tauri::{AppHandle, State};
use tokio::process::Command;

type R<T> = Result<T, String>;

// ---------- settings ----------
#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> R<HashMap<String, String>> {
    let c = state.db.lock().unwrap();
    let mut st = c.prepare("SELECT key, value FROM settings").map_err(|e| e.to_string())?;
    let rows = st
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<HashMap<_, _>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_setting(state: State<'_, AppState>, key: String, value: String) -> R<()> {
    let c = state.db.lock().unwrap();
    c.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_api_key(key: String) -> R<()> {
    if key.trim().is_empty() {
        return Err("คีย์ว่างเปล่า".into());
    }
    ai::set_key(key.trim())
}

#[tauri::command]
pub fn has_api_key() -> bool {
    ai::get_key().is_some()
}

#[tauri::command]
pub fn clear_api_key() -> R<()> {
    ai::clear_key()
}

async fn version_of(path: &Path, arg: &str) -> String {
    let mut c = Command::new(path);
    c.arg(arg).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    hide_window(&mut c);
    match tokio::time::timeout(std::time::Duration::from_secs(4), c.output()).await {
        Ok(Ok(o)) => {
            let t = String::from_utf8_lossy(if o.stdout.is_empty() { &o.stderr } else { &o.stdout }).to_string();
            t.lines().next().unwrap_or("").trim().chars().take(80).collect()
        }
        _ => String::new(),
    }
}

#[tauri::command]
pub async fn check_tools(state: State<'_, AppState>) -> R<Vec<ToolStatus>> {
    let extra = state.extra_dirs();
    let mut out = vec![];
    for (key, name, bin, arg) in [
        ("ffmpeg", "ffmpeg", "ffmpeg", "-version"),
        ("ffprobe", "ffprobe", "ffprobe", "-version"),
        ("node", "Node.js", "node", "--version"),
        ("python", "Python", "python", "--version"),
    ] {
        match find_exe(bin, &extra) {
            Some(p) => {
                let v = version_of(&p, arg).await;
                out.push(ToolStatus { key: key.into(), name: name.into(), ok: true, detail: if v.is_empty() { norm_path(&p) } else { v } });
            }
            None => out.push(ToolStatus { key: key.into(), name: name.into(), ok: false, detail: "ไม่พบใน PATH".into() }),
        }
    }
    let cli = state.setting("ai_cli_cmd").unwrap_or_else(|| "claude -p".into());
    let first = cli.split_whitespace().next().unwrap_or("claude").trim_matches('"').to_string();
    match find_exe(&first, &extra) {
        Some(p) => out.push(ToolStatus { key: "ai_cli".into(), name: format!("AI CLI ({first})"), ok: true, detail: norm_path(&p) }),
        None => out.push(ToolStatus { key: "ai_cli".into(), name: format!("AI CLI ({first})"), ok: false, detail: "ไม่พบใน PATH".into() }),
    }
    let ai_key = ai::get_key().is_some();
    out.push(ToolStatus {
        key: "ai_key".into(),
        name: "AI API key".into(),
        ok: ai_key,
        detail: if ai_key { "เก็บไว้ใน Windows Credential Manager".into() } else { "ยังไม่ได้ตั้ง".into() },
    });
    let comfy: u16 = state.setting("comfy_port").and_then(|v| v.parse().ok()).unwrap_or(8188);
    let voice: u16 = state.setting("voice_port").and_then(|v| v.parse().ok()).unwrap_or(3900);
    let (c_ok, v_ok) = tokio::task::spawn_blocking(move || (tcp_open("127.0.0.1", comfy), tcp_open("127.0.0.1", voice)))
        .await
        .map_err(|e| e.to_string())?;
    out.push(ToolStatus {
        key: "comfy".into(),
        name: "ComfyUI".into(),
        ok: c_ok,
        detail: if c_ok { format!("พอร์ต {comfy} เปิดอยู่") } else { format!("พอร์ต {comfy} ยังไม่เปิด (ขั้นตอนสร้างภาพจะเปิดเอง)") },
    });
    out.push(ToolStatus {
        key: "voice".into(),
        name: "VoiceStudio".into(),
        ok: v_ok,
        detail: if v_ok { format!("พอร์ต {voice} เปิดอยู่") } else { format!("พอร์ต {voice} ยังไม่เปิด (ขั้นตอนทำเสียงจะเปิดเอง)") },
    });
    Ok(out)
}

// ---------- projects ----------
#[tauri::command]
pub fn list_projects(state: State<'_, AppState>) -> R<Vec<Project>> {
    let c = state.db.lock().unwrap();
    let mut st = c
        .prepare("SELECT id, name, workdir, library_dir, key_prefix, config FROM projects ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = st.query_map([], db::project_from_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_project(state: State<'_, AppState>, project: Project) -> R<Project> {
    // validate the config shape before storing
    serde_json::from_value::<Config>(project.config.clone()).map_err(|e| format!("ตั้งค่าไม่ถูกรูปแบบ: {e}"))?;
    if project.name.trim().is_empty() {
        return Err("ตั้งชื่อโปรเจกต์ก่อน".into());
    }
    let cfg = serde_json::to_string(&project.config).map_err(|e| e.to_string())?;
    let c = state.db.lock().unwrap();
    let id = if project.id > 0 {
        c.execute(
            "UPDATE projects SET name=?2, workdir=?3, library_dir=?4, key_prefix=?5, config=?6 WHERE id=?1",
            params![project.id, project.name, project.workdir, project.library_dir, project.key_prefix, cfg],
        )
        .map_err(|e| e.to_string())?;
        project.id
    } else {
        c.execute(
            "INSERT INTO projects (name, workdir, library_dir, key_prefix, config) VALUES (?1,?2,?3,?4,?5)",
            params![project.name, project.workdir, project.library_dir, project.key_prefix, cfg],
        )
        .map_err(|e| e.to_string())?;
        c.last_insert_rowid()
    };
    db::get_project(&c, id)
}

#[tauri::command]
pub fn delete_project(state: State<'_, AppState>, id: i64) -> R<()> {
    let c = state.db.lock().unwrap();
    c.execute("DELETE FROM projects WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ---------- clips ----------
#[tauri::command]
pub fn list_clips(state: State<'_, AppState>, project_id: Option<i64>) -> R<Vec<Clip>> {
    let c = state.db.lock().unwrap();
    db::list_clips(&c, project_id)
}

#[tauri::command]
pub fn get_clip_detail(state: State<'_, AppState>, id: i64) -> R<ClipDetail> {
    let c = state.db.lock().unwrap();
    Ok(ClipDetail {
        clip: db::get_clip(&c, id)?,
        steps: db::list_steps(&c, id)?,
        posts: db::list_posts(&c, Some(id))?,
    })
}

#[tauri::command]
pub fn create_clip(state: State<'_, AppState>, project_id: i64) -> R<Clip> {
    let c = state.db.lock().unwrap();
    let project = db::get_project(&c, project_id)?;
    let mut st = c
        .prepare("SELECT clip_key FROM clips WHERE project_id = ?1")
        .map_err(|e| e.to_string())?;
    let keys: Vec<String> = st
        .query_map(params![project_id], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    let max = keys
        .iter()
        .filter_map(|k| k.strip_prefix(&project.key_prefix))
        .filter_map(|n| n.parse::<u32>().ok())
        .max()
        .unwrap_or(0);
    let key = format!("{}{:02}", project.key_prefix, max + 1);
    c.execute(
        "INSERT INTO clips (project_id, clip_key) VALUES (?1, ?2)",
        params![project_id, key],
    )
    .map_err(|e| e.to_string())?;
    db::get_clip(&c, c.last_insert_rowid())
}

#[tauri::command]
pub fn update_clip(state: State<'_, AppState>, id: i64, patch: ClipPatch) -> R<Clip> {
    let c = state.db.lock().unwrap();
    let cur = db::get_clip(&c, id)?;
    c.execute(
        "UPDATE clips SET title=?2, ref=?3, status=?4, brief=?5, script=?6, caption=?7, notes=?8, video_path=?9, cover_path=?10, updated_at=?11 WHERE id=?1",
        params![
            id,
            patch.title.unwrap_or(cur.title),
            patch.ref_.unwrap_or(cur.ref_),
            patch.status.unwrap_or(cur.status),
            patch.brief.unwrap_or(cur.brief),
            patch.script.unwrap_or(cur.script),
            patch.caption.unwrap_or(cur.caption),
            patch.notes.unwrap_or(cur.notes),
            patch.video_path.or(cur.video_path),
            patch.cover_path.or(cur.cover_path),
            db::now()
        ],
    )
    .map_err(|e| e.to_string())?;
    db::get_clip(&c, id)
}

#[tauri::command]
pub fn delete_clip(state: State<'_, AppState>, id: i64) -> R<()> {
    let c = state.db.lock().unwrap();
    c.execute("DELETE FROM clips WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

/// Register clips that already exist in the project's library folder (one sub-folder per clip, with meta.json or an mp4).
#[tauri::command]
pub fn import_library(state: State<'_, AppState>, project_id: i64) -> R<usize> {
    let c = state.db.lock().unwrap();
    let project = db::get_project(&c, project_id)?;
    let cfg: Config = serde_json::from_value(project.config.clone()).unwrap_or_default();
    let root = Path::new(&project.library_dir);
    if !root.is_dir() {
        return Err(format!("ไม่พบโฟลเดอร์คลัง: {}", project.library_dir));
    }
    let mut n = 0;
    let mut dirs: Vec<_> = std::fs::read_dir(root)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect();
    dirs.sort();
    for d in dirs {
        let key = match d.file_name().and_then(|s| s.to_str()) {
            Some(k) => k.to_string(),
            None => continue,
        };
        let exists: bool = c
            .query_row("SELECT COUNT(*) FROM clips WHERE project_id=?1 AND clip_key=?2", params![project_id, key], |r| r.get::<_, i64>(0))
            .map(|n| n > 0)
            .unwrap_or(false);
        if exists {
            continue;
        }
        let meta: Value = std::fs::read_to_string(d.join("meta.json"))
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or(Value::Null);
        let video = d.join(format!("{key}.mp4"));
        if meta.is_null() && !video.is_file() {
            continue;
        }
        let cover = d.join(format!("{key}_cover.jpg"));
        let caption = meta["caption_text"]
            .as_str()
            .map(|s| s.to_string())
            .or_else(|| std::fs::read_to_string(d.join("caption.txt")).ok())
            .unwrap_or_default();
        let status = match meta["status"].as_str() {
            Some(s @ ("ready" | "scheduled" | "posted" | "hold" | "blocked")) => s,
            _ => "ready",
        };
        c.execute(
            "INSERT INTO clips (project_id, clip_key, title, ref, status, caption, video_path, cover_path, duration, lufs) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![
                project_id,
                key,
                meta["title"].as_str().unwrap_or(""),
                meta["ref"].as_str().unwrap_or(""),
                status,
                caption,
                if video.is_file() { Some(norm_path(&video)) } else { None },
                if cover.is_file() { Some(norm_path(&cover)) } else { None },
                meta["length_s"].as_f64(),
                meta["loudness_lufs"].as_f64()
            ],
        )
        .map_err(|e| e.to_string())?;
        let id = c.last_insert_rowid();
        for s in cfg.steps.iter().filter(|s| s.kind != "post") {
            db::set_step(&c, id, &s.key, "done", Some("นำเข้าจากคลัง"), Some(0), false, true)?;
        }
        n += 1;
    }
    Ok(n)
}

// ---------- steps ----------
#[tauri::command]
pub async fn run_step(app: AppHandle, state: State<'_, AppState>, clip_id: i64, step_key: String) -> R<StepRow> {
    runner::execute(&app, &state, clip_id, &step_key).await
}

#[tauri::command]
pub fn cancel_step(state: State<'_, AppState>, clip_id: i64, step_key: String) -> R<bool> {
    let pid = state.running.lock().unwrap().get(&(clip_id, step_key)).map(|r| r.pid);
    match pid {
        Some(p) if p > 0 => {
            runner::kill_pid(p);
            Ok(true)
        }
        _ => Ok(false),
    }
}

#[tauri::command]
pub fn set_step_status(state: State<'_, AppState>, clip_id: i64, step_key: String, status: String) -> R<StepRow> {
    if !["pending", "running", "done", "review", "failed", "skipped"].contains(&status.as_str()) {
        return Err("สถานะไม่ถูกต้อง".into());
    }
    let c = state.db.lock().unwrap();
    db::set_step(&c, clip_id, &step_key, &status, None, None, false, status == "done" || status == "skipped")?;
    db::get_step(&c, clip_id, &step_key).ok_or("ไม่พบขั้นตอน".into())
}

#[tauri::command]
pub fn reset_steps(state: State<'_, AppState>, clip_id: i64) -> R<()> {
    let c = state.db.lock().unwrap();
    c.execute("DELETE FROM steps WHERE clip_id = ?1", params![clip_id]).map_err(|e| e.to_string())?;
    c.execute("UPDATE clips SET status = 'draft' WHERE id = ?1 AND status IN ('making','blocked')", params![clip_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn running_steps(state: State<'_, AppState>) -> Vec<(i64, String)> {
    state.running.lock().unwrap().keys().cloned().collect()
}

// ---------- posts ----------
#[tauri::command]
pub fn list_posts(state: State<'_, AppState>, clip_id: Option<i64>) -> R<Vec<Post>> {
    let c = state.db.lock().unwrap();
    db::list_posts(&c, clip_id)
}

#[tauri::command]
pub fn add_post(state: State<'_, AppState>, clip_id: i64, platform: String, scheduled_at: String, url: String, note: String) -> R<Vec<Post>> {
    let c = state.db.lock().unwrap();
    // never post the same clip twice to the same platform
    let dup: i64 = c
        .query_row(
            "SELECT COUNT(*) FROM posts WHERE clip_id = ?1 AND platform = ?2 AND status != 'cancelled'",
            params![clip_id, platform],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if dup > 0 {
        return Err(format!("คลิปนี้มีโพสต์บน {platform} แล้ว (ห้ามโพสต์ซ้ำ) ยกเลิกรายการเดิมก่อนถ้าต้องการลงใหม่"));
    }
    c.execute(
        "INSERT INTO posts (clip_id, platform, scheduled_at, url, note) VALUES (?1,?2,?3,?4,?5)",
        params![clip_id, platform, scheduled_at, url, note],
    )
    .map_err(|e| e.to_string())?;
    c.execute(
        "UPDATE clips SET status = 'scheduled', updated_at = ?2 WHERE id = ?1 AND status IN ('ready','making','draft')",
        params![clip_id, db::now()],
    )
    .map_err(|e| e.to_string())?;
    db::list_posts(&c, Some(clip_id))
}

#[tauri::command]
pub fn update_post(state: State<'_, AppState>, id: i64, status: String, url: Option<String>) -> R<()> {
    let c = state.db.lock().unwrap();
    let clip_id: i64 = c
        .query_row("SELECT clip_id FROM posts WHERE id = ?1", params![id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    c.execute(
        "UPDATE posts SET status = ?2, url = COALESCE(?3, url) WHERE id = ?1",
        params![id, status, url],
    )
    .map_err(|e| e.to_string())?;
    if status == "posted" {
        c.execute("UPDATE clips SET status = 'posted', updated_at = ?2 WHERE id = ?1", params![clip_id, db::now()])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_post(state: State<'_, AppState>, id: i64) -> R<()> {
    let c = state.db.lock().unwrap();
    c.execute("DELETE FROM posts WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ---------- stats / files ----------
#[tauri::command]
pub fn get_stats(state: State<'_, AppState>) -> R<Value> {
    let c = state.db.lock().unwrap();
    let mut st = c
        .prepare("SELECT status, COUNT(*) FROM clips GROUP BY status")
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
        .map_err(|e| e.to_string())?;
    let mut by: HashMap<String, i64> = HashMap::new();
    for r in rows.flatten() {
        by.insert(r.0, r.1);
    }
    let posts: i64 = c.query_row("SELECT COUNT(*) FROM posts WHERE status = 'scheduled'", [], |r| r.get(0)).unwrap_or(0);
    let projects: i64 = c.query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0)).unwrap_or(0);
    Ok(json!({ "by_status": by, "scheduled_posts": posts, "projects": projects }))
}

#[tauri::command]
pub fn read_text_file(path: String) -> R<String> {
    std::fs::read_to_string(&path).map_err(|e| format!("อ่านไฟล์ไม่ได้: {e}"))
}

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> R<()> {
    if let Some(p) = Path::new(&path).parent() {
        std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, content).map_err(|e| format!("เขียนไฟล์ไม่ได้: {e}"))
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
pub fn resolve_project_path(workdir: String, rel: String, key: String) -> String {
    let mut v = HashMap::new();
    v.insert("key".to_string(), key);
    norm_path(&resolve(&workdir, &subst(&rel, &v)))
}
