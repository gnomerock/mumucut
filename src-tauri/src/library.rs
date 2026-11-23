//! Shared libraries (assets, affiliate links), social accounts, the editor studio and small AI helpers.
use crate::models::*;
use crate::state::{hide_window, AppState};
use crate::util::*;
use crate::{ai, db};
use rusqlite::{params, Connection, Row};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::State;
use tokio::process::Command;

type R<T> = Result<T, String>;

const SERVICE: &str = "mumucut";
pub const SOCIAL_PLATFORMS: &[&str] = &["facebook", "instagram", "tiktok", "x", "youtube"];

pub fn kind_of(path: &str) -> &'static str {
    let ext = Path::new(path).extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp" | "svg" | "avif" => "image",
        "mp4" | "mov" | "webm" | "mkv" | "avi" | "m4v" => "video",
        "wav" | "mp3" | "m4a" | "aac" | "ogg" | "flac" | "opus" => "audio",
        _ => "file",
    }
}

// ---------- assets ----------
const ASSET_COLS: &str = "id, channel_id, clip_id, kind, name, path, tags, note, source, created_at";

fn asset_from_row(r: &Row) -> rusqlite::Result<Asset> {
    let path: String = r.get(5)?;
    Ok(Asset {
        id: r.get(0)?,
        channel_id: r.get(1)?,
        clip_id: r.get(2)?,
        kind: r.get(3)?,
        name: r.get(4)?,
        exists: Path::new(&path).exists(),
        path,
        tags: r.get(6)?,
        note: r.get(7)?,
        source: r.get(8)?,
        created_at: r.get(9)?,
    })
}

fn get_asset(c: &Connection, id: i64) -> R<Asset> {
    c.query_row(&format!("SELECT {ASSET_COLS} FROM assets WHERE id = ?1"), params![id], asset_from_row)
        .map_err(|e| format!("ไม่พบ asset: {e}"))
}

/// clip_id set: that clip's assets. Otherwise the library: items of the channel plus items shared by every channel
/// (channel_id None = the whole library of every channel).
#[tauri::command]
pub fn list_assets(state: State<'_, AppState>, channel_id: Option<i64>, clip_id: Option<i64>) -> R<Vec<Asset>> {
    let c = state.db.lock().unwrap();
    let (sql, p): (String, Vec<Option<i64>>) = match clip_id {
        Some(id) => (format!("SELECT {ASSET_COLS} FROM assets WHERE clip_id = ?1 ORDER BY id DESC"), vec![Some(id)]),
        None => (
            format!("SELECT {ASSET_COLS} FROM assets WHERE clip_id IS NULL AND (?1 IS NULL OR channel_id = ?1 OR channel_id IS NULL) ORDER BY id DESC"),
            vec![channel_id],
        ),
    };
    let mut st = c.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = st.query_map(rusqlite::params_from_iter(p), asset_from_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn insert_asset(c: &Connection, channel_id: Option<i64>, clip_id: Option<i64>, path: &str, name: &str, source: &str, note: &str, tags: &str) -> R<Asset> {
    let name = if name.trim().is_empty() {
        Path::new(path).file_name().and_then(|s| s.to_str()).unwrap_or(path).to_string()
    } else {
        name.trim().to_string()
    };
    c.execute(
        "INSERT INTO assets (channel_id, clip_id, kind, name, path, tags, note, source, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![channel_id, clip_id, kind_of(path), name, path, tags, note, source, db::now()],
    )
    .map_err(|e| e.to_string())?;
    get_asset(c, c.last_insert_rowid())
}

/// Register files (they stay where they are; MumuCut never moves or deletes them).
#[tauri::command]
pub fn add_assets(state: State<'_, AppState>, paths: Vec<String>, channel_id: Option<i64>, clip_id: Option<i64>) -> R<Vec<Asset>> {
    let c = state.db.lock().unwrap();
    let mut out = vec![];
    for p in paths.iter().map(|p| p.trim()).filter(|p| !p.is_empty()) {
        if !Path::new(p).is_file() {
            return Err(format!("ไม่พบไฟล์: {p}"));
        }
        out.push(insert_asset(&c, channel_id, clip_id, p, "", "file", "", "")?);
    }
    Ok(out)
}

#[tauri::command]
pub fn update_asset(state: State<'_, AppState>, asset: Asset) -> R<Asset> {
    let c = state.db.lock().unwrap();
    c.execute(
        "UPDATE assets SET name = ?2, tags = ?3, note = ?4, channel_id = ?5 WHERE id = ?1",
        params![asset.id, asset.name.trim(), asset.tags, asset.note, asset.channel_id],
    )
    .map_err(|e| e.to_string())?;
    get_asset(&c, asset.id)
}

/// Removes the record only; the file on disk is kept.
#[tauri::command]
pub fn delete_asset(state: State<'_, AppState>, id: i64) -> R<()> {
    let c = state.db.lock().unwrap();
    c.execute("DELETE FROM assets WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

/// Put a library asset into a clip (same file, new record for the clip).
#[tauri::command]
pub fn use_library_asset(state: State<'_, AppState>, asset_id: i64, clip_id: i64) -> R<Asset> {
    let c = state.db.lock().unwrap();
    let a = get_asset(&c, asset_id)?;
    let clip = db::get_clip(&c, clip_id)?;
    let dup: i64 = c
        .query_row("SELECT COUNT(*) FROM assets WHERE clip_id = ?1 AND path = ?2", params![clip_id, a.path], |r| r.get(0))
        .unwrap_or(0);
    if dup > 0 {
        return Err(format!("{} มี {} อยู่แล้ว", clip.clip_key, a.name));
    }
    insert_asset(&c, Some(clip.project_id), Some(clip_id), &a.path, &a.name, "library", &a.note, &a.tags)
}

/// Copy a clip asset into the shared library of its channel.
#[tauri::command]
pub fn share_asset(state: State<'_, AppState>, asset_id: i64) -> R<Asset> {
    let c = state.db.lock().unwrap();
    let a = get_asset(&c, asset_id)?;
    let dup: i64 = c
        .query_row("SELECT COUNT(*) FROM assets WHERE clip_id IS NULL AND path = ?1", params![a.path], |r| r.get(0))
        .unwrap_or(0);
    if dup > 0 {
        return Err(format!("{} อยู่ในคลัง assets แล้ว", a.name));
    }
    insert_asset(&c, a.channel_id, None, &a.path, &a.name, a.source.as_str(), &a.note, &a.tags)
}

fn ps_literal(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// Which provider makes this kind: the default chosen in Settings, else the first one that is set up.
pub fn pick_provider(state: &AppState, kind: &str) -> Option<String> {
    let set = |k: &str| state.setting(k).map(|v| !v.trim().is_empty()).unwrap_or(false);
    let candidates: Vec<(&str, bool)> = match kind {
        "image" => vec![("comfyui", set("comfy_image_cmd")), ("openai-image", crate::providers::get_key("openai-image").is_some()), ("custom-image", set("gen_image_cmd"))],
        "speech" => vec![("voicestudio", set("voice_cmd")), ("elevenlabs", crate::providers::get_key("elevenlabs").is_some()), ("custom-audio", set("gen_audio_cmd"))],
        "sfx" => vec![("elevenlabs", crate::providers::get_key("elevenlabs").is_some())],
        _ => vec![],
    };
    if let Some(d) = state.setting(&format!("default_{kind}")).filter(|d| !d.trim().is_empty()) {
        if candidates.iter().any(|(id, ok)| *id == d && *ok) {
            return Some(d);
        }
    }
    candidates.into_iter().find(|(_, ok)| *ok).map(|(id, _)| id.to_string())
}

/// Make an image, speech or a sound effect with the provider chosen in Settings, then register the file.
/// Command providers get {prompt} (quoted), {out}, {workdir}, {key}, and the env vars MUMU_PROMPT / MUMU_OUT.
#[tauri::command]
pub async fn generate_asset(state: State<'_, AppState>, channel_id: Option<i64>, clip_id: Option<i64>, kind: String, prompt: String) -> R<Asset> {
    if prompt.trim().is_empty() {
        return Err("พิมพ์คำอธิบายสิ่งที่ต้องการก่อน".into());
    }
    let kind = if kind == "audio" { "speech".to_string() } else { kind };
    let label = match kind.as_str() {
        "image" => "ภาพ",
        "speech" => "เสียงพูด",
        "sfx" => "เสียงประกอบ",
        "music" => "เพลง",
        _ => return Err("ชนิดที่สร้างได้: image, speech, sfx".into()),
    };
    let provider = pick_provider(&state, &kind).ok_or(format!("ยังไม่มีผู้ให้บริการสร้าง{label} ไปที่ Settings → AI providers เพื่อเชื่อมต่อ"))?;
    let (workdir, key, channel) = {
        let c = state.db.lock().unwrap();
        let clip = clip_id.map(|id| db::get_clip(&c, id)).transpose()?;
        let ch = clip.as_ref().map(|x| x.project_id).or(channel_id);
        let workdir = ch.and_then(|id| db::get_project(&c, id).ok()).map(|p| p.workdir).unwrap_or_default();
        (workdir, clip.map(|x| x.clip_key).unwrap_or_else(|| "library".into()), ch)
    };
    let base: PathBuf = if !workdir.is_empty() && Path::new(&workdir).is_dir() {
        PathBuf::from(&workdir).join("assets")
    } else {
        state.data_dir.join("assets")
    };
    let dir = base.join(&key);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let ext = match provider.as_str() {
        "elevenlabs" => "mp3",
        _ if kind == "image" => "png",
        _ => "wav",
    };
    let out = dir.join(format!("ai_{kind}_{stamp}.{ext}"));
    let out_s = norm_path(&out);
    let setting = |k: &str, d: &str| state.setting(k).filter(|v| !v.trim().is_empty()).unwrap_or_else(|| d.to_string());
    match provider.as_str() {
        "openai-image" => crate::providers::openai_image(prompt.trim(), &out, &setting("openai_image_model", "gpt-image-1"), &setting("openai_image_size", "1024x1536")).await?,
        "elevenlabs" => crate::providers::elevenlabs(&kind, prompt.trim(), &out, &setting("elevenlabs_voice", ""), &setting("elevenlabs_model", "eleven_multilingual_v2")).await?,
        p => {
            let tk = match p {
                "comfyui" => "comfy_image_cmd",
                "custom-image" => "gen_image_cmd",
                "voicestudio" => "voice_cmd",
                _ => "gen_audio_cmd",
            };
            run_gen_command(&state, &setting(tk, ""), &kind, &stamp, &out, prompt.trim(), &workdir, &key).await?;
        }
    }
    if !out.is_file() {
        return Err(format!("สร้างไม่สำเร็จ: ไม่พบไฟล์ {out_s}"));
    }
    let c = state.db.lock().unwrap();
    insert_asset(&c, channel, clip_id, &out_s, "", "ai", prompt.trim(), &provider)
}

#[allow(clippy::too_many_arguments)]
async fn run_gen_command(state: &AppState, template: &str, kind: &str, stamp: &str, out: &Path, prompt: &str, workdir: &str, key: &str) -> R<()> {
    if template.trim().is_empty() {
        return Err("ยังไม่ได้ตั้งคำสั่งของผู้ให้บริการนี้ (Settings → AI providers)".into());
    }
    let out_s = norm_path(out);
    let mut v = HashMap::new();
    v.insert("out".to_string(), out_s.clone());
    v.insert("workdir".to_string(), workdir.to_string());
    v.insert("key".to_string(), key.to_string());
    v.insert("prompt".to_string(), ps_literal(prompt));
    let body = subst(template, &v);

    let run_dir = state.data_dir.join("run");
    std::fs::create_dir_all(&run_dir).map_err(|e| e.to_string())?;
    let file = run_dir.join(format!("gen_{kind}_{stamp}.ps1"));
    let text = format!(
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\r\n$OutputEncoding = [System.Text.Encoding]::UTF8\r\n$ErrorActionPreference = 'Stop'\r\n{}\r\nexit $LASTEXITCODE\r\n",
        body.replace('\n', "\r\n")
    );
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(text.as_bytes());
    std::fs::write(&file, bytes).map_err(|e| e.to_string())?;
    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"]).arg(&file);
    if Path::new(workdir).is_dir() {
        cmd.current_dir(workdir);
    }
    cmd.env("PATH", state.child_path())
        .env("PYTHONIOENCODING", "utf-8")
        .env("MUMU_PROMPT", prompt)
        .env("MUMU_OUT", &out_s)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    hide_window(&mut cmd);
    let res = tokio::time::timeout(std::time::Duration::from_secs(20 * 60), cmd.output()).await;
    let _ = std::fs::remove_file(&file);
    let o = match res {
        Err(_) => return Err("คำสั่งสร้างใช้เวลาเกิน 20 นาที จึงหยุด".into()),
        Ok(Err(e)) => return Err(format!("เปิดคำสั่งไม่ได้: {e}")),
        Ok(Ok(o)) => o,
    };
    let log = format!("{}{}", String::from_utf8_lossy(&o.stdout), String::from_utf8_lossy(&o.stderr));
    if !o.status.success() {
        return Err(format!("คำสั่งสร้างล้มเหลว\n{}", tail_chars(log.trim(), 1200)));
    }
    if !out.is_file() {
        return Err(format!("คำสั่งจบแล้วแต่ไม่พบไฟล์ {out_s}\n(คำสั่งต้องเขียนไฟล์ไปที่ {{out}})\n{}", tail_chars(log.trim(), 800)));
    }
    Ok(())
}

// ---------- affiliate links ----------
const LINK_COLS: &str = "l.id, l.channel_id, l.platform, l.title, l.url, l.note, l.tags, l.created_at, (SELECT COUNT(*) FROM clip_affiliates x WHERE x.link_id = l.id)";

fn link_from_row(r: &Row) -> rusqlite::Result<AffiliateLink> {
    Ok(AffiliateLink {
        id: r.get(0)?,
        channel_id: r.get(1)?,
        platform: r.get(2)?,
        title: r.get(3)?,
        url: r.get(4)?,
        note: r.get(5)?,
        tags: r.get(6)?,
        created_at: r.get(7)?,
        used: r.get(8)?,
    })
}

#[tauri::command]
pub fn list_affiliates(state: State<'_, AppState>, channel_id: Option<i64>) -> R<Vec<AffiliateLink>> {
    let c = state.db.lock().unwrap();
    let mut st = c
        .prepare(&format!("SELECT {LINK_COLS} FROM affiliate_links l WHERE (?1 IS NULL OR l.channel_id = ?1 OR l.channel_id IS NULL) ORDER BY l.id DESC"))
        .map_err(|e| e.to_string())?;
    let rows = st.query_map(params![channel_id], link_from_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn get_link(c: &Connection, id: i64) -> R<AffiliateLink> {
    c.query_row(&format!("SELECT {LINK_COLS} FROM affiliate_links l WHERE l.id = ?1"), params![id], link_from_row)
        .map_err(|e| format!("ไม่พบลิงก์: {e}"))
}

#[tauri::command]
pub fn save_affiliate(state: State<'_, AppState>, link: AffiliateLink) -> R<AffiliateLink> {
    let url = link.url.trim();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("ลิงก์ต้องขึ้นต้นด้วย https://".into());
    }
    let platform = if link.platform.trim().is_empty() { "other" } else { link.platform.trim() };
    let c = state.db.lock().unwrap();
    let id = if link.id > 0 {
        c.execute(
            "UPDATE affiliate_links SET channel_id=?2, platform=?3, title=?4, url=?5, note=?6, tags=?7 WHERE id=?1",
            params![link.id, link.channel_id, platform, link.title.trim(), url, link.note, link.tags],
        )
        .map_err(|e| e.to_string())?;
        link.id
    } else {
        c.execute(
            "INSERT INTO affiliate_links (channel_id, platform, title, url, note, tags, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![link.channel_id, platform, link.title.trim(), url, link.note, link.tags, db::now()],
        )
        .map_err(|e| e.to_string())?;
        c.last_insert_rowid()
    };
    get_link(&c, id)
}

#[tauri::command]
pub fn delete_affiliate(state: State<'_, AppState>, id: i64) -> R<()> {
    let c = state.db.lock().unwrap();
    c.execute("DELETE FROM affiliate_links WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_clip_affiliates(state: State<'_, AppState>, clip_id: i64) -> R<Vec<ClipAffiliate>> {
    let c = state.db.lock().unwrap();
    let mut st = c
        .prepare(&format!("SELECT {LINK_COLS}, x.placement FROM clip_affiliates x JOIN affiliate_links l ON l.id = x.link_id WHERE x.clip_id = ?1 ORDER BY l.id"))
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map(params![clip_id], |r| Ok(ClipAffiliate { link: link_from_row(r)?, placement: r.get(9)? }))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn attach_affiliate(state: State<'_, AppState>, clip_id: i64, link_id: i64, placement: String) -> R<()> {
    let c = state.db.lock().unwrap();
    c.execute(
        "INSERT INTO clip_affiliates (clip_id, link_id, placement) VALUES (?1,?2,?3) ON CONFLICT(clip_id, link_id) DO UPDATE SET placement = excluded.placement",
        params![clip_id, link_id, placement],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn detach_affiliate(state: State<'_, AppState>, clip_id: i64, link_id: i64) -> R<()> {
    let c = state.db.lock().unwrap();
    c.execute("DELETE FROM clip_affiliates WHERE clip_id = ?1 AND link_id = ?2", params![clip_id, link_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------- social accounts ----------
fn token_user(id: i64) -> String {
    format!("social-{id}-token")
}

fn account_from_row(r: &Row) -> rusqlite::Result<SocialAccount> {
    let id: i64 = r.get(0)?;
    Ok(SocialAccount {
        id,
        channel_id: r.get(1)?,
        platform: r.get(2)?,
        name: r.get(3)?,
        handle: r.get(4)?,
        url: r.get(5)?,
        created_at: r.get(6)?,
        has_token: keyring::Entry::new(SERVICE, &token_user(id)).ok().and_then(|e| e.get_password().ok()).is_some(),
    })
}

const ACCOUNT_COLS: &str = "id, channel_id, platform, name, handle, url, created_at";

#[tauri::command]
pub fn list_accounts(state: State<'_, AppState>, channel_id: Option<i64>) -> R<Vec<SocialAccount>> {
    let c = state.db.lock().unwrap();
    let mut st = c
        .prepare(&format!("SELECT {ACCOUNT_COLS} FROM social_accounts WHERE (?1 IS NULL OR channel_id = ?1 OR channel_id IS NULL) ORDER BY platform, id"))
        .map_err(|e| e.to_string())?;
    let rows = st.query_map(params![channel_id], account_from_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_account(state: State<'_, AppState>, account: SocialAccount) -> R<SocialAccount> {
    if !SOCIAL_PLATFORMS.contains(&account.platform.as_str()) {
        return Err("แพลตฟอร์มที่รองรับ: facebook, instagram, tiktok, x, youtube".into());
    }
    if account.name.trim().is_empty() && account.handle.trim().is_empty() {
        return Err("ใส่ชื่อเพจหรือชื่อบัญชีก่อน".into());
    }
    let c = state.db.lock().unwrap();
    let id = if account.id > 0 {
        c.execute(
            "UPDATE social_accounts SET channel_id=?2, platform=?3, name=?4, handle=?5, url=?6 WHERE id=?1",
            params![account.id, account.channel_id, account.platform, account.name.trim(), account.handle.trim(), account.url.trim()],
        )
        .map_err(|e| e.to_string())?;
        account.id
    } else {
        c.execute(
            "INSERT INTO social_accounts (channel_id, platform, name, handle, url, created_at) VALUES (?1,?2,?3,?4,?5,?6)",
            params![account.channel_id, account.platform, account.name.trim(), account.handle.trim(), account.url.trim(), db::now()],
        )
        .map_err(|e| e.to_string())?;
        c.last_insert_rowid()
    };
    c.query_row(&format!("SELECT {ACCOUNT_COLS} FROM social_accounts WHERE id = ?1"), params![id], account_from_row)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_account(state: State<'_, AppState>, id: i64) -> R<()> {
    let c = state.db.lock().unwrap();
    c.execute("DELETE FROM social_accounts WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    let _ = clear_account_token(id);
    Ok(())
}

#[tauri::command]
pub fn set_account_token(id: i64, token: String) -> R<()> {
    if token.trim().is_empty() {
        return Err("โทเคนว่างเปล่า".into());
    }
    keyring::Entry::new(SERVICE, &token_user(id))
        .and_then(|e| e.set_password(token.trim()))
        .map_err(|e| format!("บันทึกโทเคนไม่ได้: {e}"))
}

#[tauri::command]
pub fn clear_account_token(id: i64) -> R<()> {
    match keyring::Entry::new(SERVICE, &token_user(id)).and_then(|e| e.delete_credential()) {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("ลบโทเคนไม่ได้: {e}")),
    }
}

// ---------- editor studio ----------
pub fn studio_command(cfg: &Config) -> R<String> {
    if !cfg.studio_cmd.trim().is_empty() {
        return Ok(cfg.studio_cmd.trim().to_string());
    }
    match cfg.renderer.as_str() {
        "hyperframes" => Ok("npx hyperframes preview".into()),
        "manual" => Err("ช่องนี้ตั้งเป็นตัดต่อเอง ไม่มี studio ให้เปิด ใช้ปุ่ม แนบวิดีโอ แทน".into()),
        _ => Ok("npx remotion studio".into()),
    }
}

/// Open the renderer's studio (Remotion Studio / HyperFrames preview) in a visible console in the work folder.
#[tauri::command]
pub fn open_studio(state: State<'_, AppState>, channel_id: i64) -> R<String> {
    let project = {
        let c = state.db.lock().unwrap();
        db::get_project(&c, channel_id)?
    };
    let cfg: Config = serde_json::from_value(project.config.clone()).unwrap_or_default();
    let cmd = studio_command(&cfg)?;
    if !Path::new(&project.workdir).is_dir() {
        return Err(format!("ไม่พบโฟลเดอร์งานของช่อง: {}", project.workdir));
    }
    let mut c = std::process::Command::new("cmd.exe");
    c.args(["/C", "start", "MumuCut studio", "powershell.exe", "-NoExit", "-NoProfile", "-Command", &cmd])
        .current_dir(&project.workdir)
        .env("PATH", state.child_path());
    c.spawn().map_err(|e| format!("เปิด studio ไม่ได้: {e}"))?;
    Ok(cmd)
}

// ---------- helpers ----------
/// Ask an agent (empty id = the default agent) and return its answer text.
#[tauri::command]
pub async fn ai_write(state: State<'_, AppState>, prompt: String, agent_id: Option<String>) -> R<String> {
    let agent = {
        let c = state.db.lock().unwrap();
        db::pick_agent(&c, agent_id.as_deref().unwrap_or("")).ok_or("ยังไม่มี AI agent ไปที่ ตั้งค่า เพื่อเพิ่ม")?
    };
    let cwd = state.data_dir.to_string_lossy().to_string();
    ai::complete(&state, &agent, &prompt, &cwd, |_, _| {}).await.map(|s| s.trim().to_string())
}

#[tauri::command]
pub fn ensure_dir(path: String) -> R<()> {
    if path.trim().is_empty() {
        return Ok(());
    }
    std::fs::create_dir_all(path.trim()).map_err(|e| format!("สร้างโฟลเดอร์ไม่ได้: {e}"))
}
