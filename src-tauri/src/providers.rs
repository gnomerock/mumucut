//! AI providers for images / video / audio, tool install status, installers and the ComfyUI MCP connection.
use crate::state::{hide_window, AppState};
use crate::util::*;
use crate::db;
use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::State;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

type R<T> = Result<T, String>;
const SERVICE: &str = "mumucut";
/// providers that keep an API key in the credential manager
pub const KEY_PROVIDERS: &[&str] = &["elevenlabs", "openai-image"];

fn key_user(id: &str) -> String {
    format!("provider-{id}-key")
}
pub fn get_key(id: &str) -> Option<String> {
    keyring::Entry::new(SERVICE, &key_user(id)).ok()?.get_password().ok().filter(|k| !k.trim().is_empty())
}

#[tauri::command]
pub fn set_provider_key(id: String, key: String) -> R<()> {
    if !KEY_PROVIDERS.contains(&id.as_str()) {
        return Err("ผู้ให้บริการนี้ไม่ใช้ API key".into());
    }
    if key.trim().is_empty() {
        return Err("คีย์ว่างเปล่า".into());
    }
    keyring::Entry::new(SERVICE, &key_user(&id))
        .and_then(|e| e.set_password(key.trim()))
        .map_err(|e| format!("บันทึกคีย์ไม่ได้: {e}"))
}

#[tauri::command]
pub fn clear_provider_key(id: String) -> R<()> {
    match keyring::Entry::new(SERVICE, &key_user(&id)).and_then(|e| e.delete_credential()) {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("ลบคีย์ไม่ได้: {e}")),
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct ProviderStatus {
    pub id: String,
    /// connected / installed and usable
    pub ok: bool,
    pub detail: String,
    pub version: String,
}

fn st(id: &str, ok: bool, detail: impl Into<String>, version: impl Into<String>) -> ProviderStatus {
    ProviderStatus { id: id.into(), ok, detail: detail.into(), version: version.into() }
}

fn pkg_version(p: &Path) -> Option<String> {
    let t = std::fs::read_to_string(p).ok()?;
    let j: Value = serde_json::from_str(&t).ok()?;
    j["version"].as_str().map(|s| s.to_string())
}

fn home() -> PathBuf {
    std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).map(PathBuf::from).unwrap_or_default()
}

/// skills installed for coding agents: (count, names) of folders starting with `prefix`
fn skills_with(prefix: &str) -> Vec<String> {
    let mut names: Vec<String> = vec![];
    for dir in [home().join(".claude").join("skills"), home().join(".agents").join("skills")] {
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                let n = e.file_name().to_string_lossy().to_string();
                if n.starts_with(prefix) && e.path().join("SKILL.md").is_file() && !names.contains(&n) {
                    names.push(n);
                }
            }
        }
    }
    names.sort();
    names
}

/// Global npm packages: next to node.exe (fnm/nvm/official installer) or in %APPDATA%\npm.
fn global_pkg(state: &AppState, name: &str) -> Option<String> {
    let mut roots = vec![];
    if let Some(node) = find_exe("node", &state.extra_dirs()) {
        if let Some(d) = node.parent() {
            roots.push(d.join("node_modules"));
        }
    }
    if let Some(a) = std::env::var_os("APPDATA") {
        roots.push(PathBuf::from(a).join("npm").join("node_modules"));
    }
    roots.into_iter().find_map(|r| pkg_version(&r.join(name).join("package.json")))
}

fn comfy_url(state: &AppState) -> String {
    state
        .setting("comfy_url")
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| format!("http://127.0.0.1:{}", state.setting("comfy_port").unwrap_or_else(|| "8188".into())))
}

fn host_port(url: &str) -> (String, u16) {
    let rest = url.split("://").nth(1).unwrap_or(url);
    let hp = rest.split('/').next().unwrap_or("127.0.0.1:8188");
    let mut it = hp.rsplitn(2, ':');
    let port = it.next().and_then(|p| p.parse().ok()).unwrap_or(8188);
    let host = it.next().unwrap_or("127.0.0.1").to_string();
    (if host.is_empty() { "127.0.0.1".into() } else { host }, port)
}

pub const COMFY_MCP_OFFICIAL: &str = "comfy-mcp";
/// installed with `npm install -g comfyui-mcp` (npx -y hits an npm 11 cache-lock bug on Windows)
pub const COMFY_MCP_NPM: &str = "comfyui-mcp";

pub fn comfy_mcp_command(state: &AppState) -> String {
    match state.setting("comfy_mcp_preset").as_deref() {
        Some("custom") => state.setting("comfy_mcp_cmd").unwrap_or_default(),
        Some("official") => COMFY_MCP_OFFICIAL.into(),
        _ => COMFY_MCP_NPM.into(),
    }
}

/// Split a command line into program + args (double quotes group words).
pub fn split_cmd(s: &str) -> Vec<String> {
    let mut out = vec![];
    let mut cur = String::new();
    let mut q = false;
    for ch in s.trim().chars() {
        match ch {
            '"' => q = !q,
            c if c.is_whitespace() && !q => {
                if !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                }
            }
            c => cur.push(c),
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

/// The ComfyUI MCP server entry for the flow agent's MCP config, when it is switched on.
pub fn comfy_mcp_server(state: &AppState) -> Option<Value> {
    if state.setting("comfy_mcp_enabled").as_deref() != Some("1") {
        return None;
    }
    let parts = split_cmd(&comfy_mcp_command(state));
    let (cmd, args) = parts.split_first()?;
    Some(json!({"type": "stdio", "command": cmd, "args": args, "env": {"COMFYUI_URL": comfy_url(state)}}))
}

#[tauri::command]
pub async fn provider_status(state: State<'_, AppState>, channel_id: Option<i64>) -> R<Vec<ProviderStatus>> {
    let extra = state.extra_dirs();
    let mut out = vec![];
    let workdir = channel_id
        .and_then(|id| db::get_project(&state.db.lock().unwrap(), id).ok())
        .map(|p| p.workdir)
        .unwrap_or_default();
    let wd = Path::new(&workdir);

    // ---- video tools
    match find_exe("ffmpeg", &extra) {
        Some(p) => {
            let v = version_line(&p, "-version").await;
            let ver = v.split_whitespace().nth(2).unwrap_or("").to_string();
            out.push(st("ffmpeg", true, norm_path(&p), ver));
        }
        None => out.push(st("ffmpeg", false, "ไม่พบ ffmpeg ใน PATH หรือโฟลเดอร์ที่ตั้งไว้", "")),
    }
    let remotion = pkg_version(&wd.join("node_modules").join("@remotion").join("cli").join("package.json"))
        .or_else(|| pkg_version(&wd.join("node_modules").join("remotion").join("package.json")));
    out.push(match (&remotion, workdir.is_empty()) {
        (Some(v), _) => st("remotion", true, format!("ในโฟลเดอร์งานของช่อง {}", workdir), v.clone()),
        (None, true) => st("remotion", false, "เลือกช่องที่มีโฟลเดอร์งานก่อน (Remotion ติดตั้งต่อโปรเจกต์)", ""),
        (None, false) => st("remotion", false, format!("ยังไม่ได้ติดตั้งใน {}", workdir), ""),
    });
    let hf = pkg_version(&wd.join("node_modules").join("hyperframes").join("package.json")).map(|v| (v, "ในโฟลเดอร์งานของช่อง")).or_else(|| global_pkg(&state, "hyperframes").map(|v| (v, "ติดตั้งแบบ global")));
    out.push(match hf {
        Some((v, w)) => st("hyperframes", true, w, v),
        None => st("hyperframes", false, "ยังไม่ได้ติดตั้ง (ใช้ผ่าน npx ได้ แต่ครั้งแรกจะช้า)", ""),
    });
    let rs = skills_with("remotion");
    out.push(st("skills-remotion", !rs.is_empty(), if rs.is_empty() { "ยังไม่ได้ติดตั้ง".into() } else { rs.join(", ") }, if rs.is_empty() { String::new() } else { format!("{} skills", rs.len()) }));
    let hs = skills_with("hyperframes");
    out.push(st("skills-hyperframes", !hs.is_empty(), if hs.is_empty() { "ยังไม่ได้ติดตั้ง".into() } else { hs.join(", ") }, if hs.is_empty() { String::new() } else { format!("{} skills", hs.len()) }));

    // ---- image
    let url = comfy_url(&state);
    let (h, p) = host_port(&url);
    let comfy_cmd = state.setting("comfy_image_cmd").unwrap_or_default();
    let open = tokio::task::spawn_blocking({
        let h = h.clone();
        move || tcp_open(&h, p)
    })
    .await
    .unwrap_or(false);
    out.push(st(
        "comfyui",
        !comfy_cmd.trim().is_empty(),
        format!("{url} {}{}", if open { "เปิดอยู่" } else { "ยังไม่เปิด" }, if comfy_cmd.trim().is_empty() { ", ยังไม่ได้ตั้งคำสั่งสร้างภาพ" } else { "" }),
        "",
    ));
    let mcp_cmd = comfy_mcp_command(&state);
    let prog = split_cmd(&mcp_cmd).into_iter().next().unwrap_or_default();
    let found = !prog.is_empty() && find_exe(prog.trim_end_matches(".exe").trim_end_matches(".cmd"), &extra).is_some();
    let on = state.setting("comfy_mcp_enabled").as_deref() == Some("1");
    out.push(st(
        "comfyui-mcp",
        on && found,
        if !found { format!("ไม่พบโปรแกรม {prog}") } else if on { format!("agent ใช้ {mcp_cmd}") } else { "ปิดอยู่".into() },
        "",
    ));
    out.push(st("openai-image", get_key("openai-image").is_some(), if get_key("openai-image").is_some() { "มี API key ใน Credential Manager" } else { "ยังไม่ได้ใส่ API key" }, ""));
    let ci = state.setting("gen_image_cmd").unwrap_or_default();
    out.push(st("custom-image", !ci.trim().is_empty(), if ci.trim().is_empty() { "ยังไม่ได้ตั้งคำสั่ง" } else { "ตั้งคำสั่งแล้ว" }, ""));

    // ---- audio
    let vport: u16 = state.setting("voice_port").and_then(|v| v.parse().ok()).unwrap_or(3900);
    let vopen = tokio::task::spawn_blocking(move || tcp_open("127.0.0.1", vport)).await.unwrap_or(false);
    let vcmd = state.setting("voice_cmd").unwrap_or_default();
    out.push(st(
        "voicestudio",
        !vcmd.trim().is_empty(),
        format!("พอร์ต {vport} {}{}", if vopen { "เปิดอยู่" } else { "ยังไม่เปิด" }, if vcmd.trim().is_empty() { ", ยังไม่ได้ตั้งคำสั่งทำเสียง" } else { "" }),
        "",
    ));
    out.push(st("elevenlabs", get_key("elevenlabs").is_some(), if get_key("elevenlabs").is_some() { "มี API key ใน Credential Manager" } else { "ยังไม่ได้ใส่ API key" }, ""));
    let ca = state.setting("gen_audio_cmd").unwrap_or_default();
    out.push(st("custom-audio", !ca.trim().is_empty(), if ca.trim().is_empty() { "ยังไม่ได้ตั้งคำสั่ง" } else { "ตั้งคำสั่งแล้ว" }, ""));
    Ok(out)
}

async fn version_line(path: &Path, arg: &str) -> String {
    let mut c = Command::new(path);
    c.arg(arg).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    hide_window(&mut c);
    match tokio::time::timeout(std::time::Duration::from_secs(5), c.output()).await {
        Ok(Ok(o)) => String::from_utf8_lossy(&o.stdout).lines().next().unwrap_or("").trim().to_string(),
        _ => String::new(),
    }
}

/// Open a visible console that runs an installer; the user watches it and presses "check again".
#[tauri::command]
pub fn run_installer(state: State<'_, AppState>, id: String, channel_id: Option<i64>) -> R<String> {
    let (cmd, needs_workdir) = match id.as_str() {
        "ffmpeg" => ("winget install --id Gyan.FFmpeg -e", false),
        "remotion" => ("npm install remotion @remotion/cli", true),
        "hyperframes" => ("npm install -g hyperframes", false),
        "skills-remotion" => ("npx skills add remotion-dev/skills", false),
        "skills-hyperframes" => ("npx skills add heygen-com/hyperframes", false),
        "comfyui-mcp-official" => ("pip install comfy-mcp \"comfy-cli>=1.14.0\"", false),
        "comfyui-mcp-npm" => ("npm install -g comfyui-mcp", false),
        _ => return Err("ไม่รู้จักตัวติดตั้งนี้".into()),
    };
    let dir = if needs_workdir {
        let p = channel_id
            .and_then(|id| db::get_project(&state.db.lock().unwrap(), id).ok())
            .map(|p| p.workdir)
            .unwrap_or_default();
        if !Path::new(&p).is_dir() {
            return Err("ต้องเลือกช่องที่มีโฟลเดอร์งานก่อน".into());
        }
        PathBuf::from(p)
    } else {
        home()
    };
    let mut c = std::process::Command::new("cmd.exe");
    c.args(["/C", "start", "MumuCut installer", "powershell.exe", "-NoExit", "-NoProfile", "-Command", cmd])
        .current_dir(&dir)
        .env("PATH", state.child_path());
    c.spawn().map_err(|e| format!("เปิดตัวติดตั้งไม่ได้: {e}"))?;
    Ok(cmd.to_string())
}

/// Start the ComfyUI MCP server, do the MCP handshake and count its tools.
#[tauri::command]
pub async fn test_comfy_mcp(state: State<'_, AppState>) -> R<String> {
    let line = comfy_mcp_command(&state);
    let parts = split_cmd(&line);
    let (prog, args) = parts.split_first().ok_or("ยังไม่ได้ตั้งคำสั่ง MCP")?;
    let exe = find_exe(prog.trim_end_matches(".exe").trim_end_matches(".cmd"), &state.extra_dirs()).ok_or(format!("ไม่พบโปรแกรม {prog} (ติดตั้งก่อน)"))?;
    let mut cmd = Command::new(&exe);
    cmd.args(args)
        .env("PATH", state.child_path())
        .env("COMFYUI_URL", comfy_url(&state))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    hide_window(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| format!("เปิด {line} ไม่ได้: {e}"))?;
    // keep the server's stderr so a failure can say why
    let err_buf = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
    if let Some(se) = child.stderr.take() {
        let b = err_buf.clone();
        tokio::spawn(async move {
            let mut l = BufReader::new(se).lines();
            while let Ok(Some(x)) = l.next_line().await {
                let mut s = b.lock().unwrap();
                s.push_str(&x);
                s.push('\n');
            }
        });
    }
    let mut stdin = child.stdin.take().ok_or("no stdin")?;
    let mut rd = BufReader::new(child.stdout.take().ok_or("no stdout")?).lines();
    let work = async {
        let send = |v: Value| format!("{}\n", v);
        stdin
            .write_all(send(json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"mumucut","version":"1"}}})).as_bytes())
            .await
            .map_err(|e| e.to_string())?;
        let mut server = String::new();
        while let Some(l) = rd.next_line().await.map_err(|e| e.to_string())? {
            if let Ok(v) = serde_json::from_str::<Value>(&l) {
                if v["id"] == 1 {
                    server = format!("{} {}", v["result"]["serverInfo"]["name"].as_str().unwrap_or("?"), v["result"]["serverInfo"]["version"].as_str().unwrap_or(""));
                    break;
                }
            }
        }
        stdin.write_all(send(json!({"jsonrpc":"2.0","method":"notifications/initialized"})).as_bytes()).await.map_err(|e| e.to_string())?;
        stdin.write_all(send(json!({"jsonrpc":"2.0","id":2,"method":"tools/list"})).as_bytes()).await.map_err(|e| e.to_string())?;
        while let Some(l) = rd.next_line().await.map_err(|e| e.to_string())? {
            if let Ok(v) = serde_json::from_str::<Value>(&l) {
                if v["id"] == 2 {
                    let n = v["result"]["tools"].as_array().map(|a| a.len()).unwrap_or(0);
                    return Ok::<String, String>(format!("เชื่อมได้: {} มีเครื่องมือ {n} อย่าง", server.trim()));
                }
            }
        }
        Err("เซิร์ฟเวอร์ปิดก่อนตอบ".into())
    };
    let r = tokio::time::timeout(std::time::Duration::from_secs(120), work).await;
    let _ = child.kill().await;
    let why = || {
        let e = err_buf.lock().unwrap().clone();
        if e.trim().is_empty() { String::new() } else { format!("\n{}", tail_chars(e.trim(), 600)) }
    };
    match r {
        Ok(Ok(x)) => Ok(x),
        Ok(Err(e)) => Err(format!("เชื่อมไม่ได้: {e}{}", why())),
        Err(_) => Err(format!("รอเกิน 2 นาที{}", why())),
    }
}

// ---------- API generation ----------
pub async fn openai_image(prompt: &str, out: &Path, model: &str, size: &str) -> R<()> {
    use base64::Engine;
    let key = get_key("openai-image").ok_or("ยังไม่ได้ใส่ OpenAI API key (Settings → Image → OpenAI)")?;
    let r = reqwest::Client::new()
        .post("https://api.openai.com/v1/images/generations")
        .bearer_auth(key)
        .json(&json!({"model": model, "prompt": prompt, "size": size, "n": 1}))
        .timeout(std::time::Duration::from_secs(300))
        .send()
        .await
        .map_err(|e| format!("เรียก OpenAI ไม่ได้: {e}"))?;
    let status = r.status();
    let j: Value = r.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("OpenAI ตอบ {status}: {}", j["error"]["message"].as_str().unwrap_or("")));
    }
    let bytes = if let Some(b) = j["data"][0]["b64_json"].as_str() {
        base64::engine::general_purpose::STANDARD.decode(b).map_err(|e| e.to_string())?
    } else if let Some(u) = j["data"][0]["url"].as_str() {
        reqwest::get(u).await.map_err(|e| e.to_string())?.bytes().await.map_err(|e| e.to_string())?.to_vec()
    } else {
        return Err("OpenAI ไม่ได้ส่งภาพกลับมา".into());
    };
    std::fs::write(out, bytes).map_err(|e| e.to_string())
}

/// kind = "speech" (text to speech) or "sfx" (sound effect from a description)
pub async fn elevenlabs(kind: &str, text: &str, out: &Path, voice: &str, model: &str) -> R<()> {
    let key = get_key("elevenlabs").ok_or("ยังไม่ได้ใส่ ElevenLabs API key (Settings → Audio → ElevenLabs)")?;
    let (url, body) = if kind == "sfx" {
        ("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128".to_string(), json!({"text": text}))
    } else {
        if voice.trim().is_empty() {
            return Err("ยังไม่ได้ตั้ง Voice ID ของ ElevenLabs".into());
        }
        (
            format!("https://api.elevenlabs.io/v1/text-to-speech/{}?output_format=mp3_44100_128", voice.trim()),
            json!({"text": text, "model_id": if model.trim().is_empty() { "eleven_multilingual_v2" } else { model.trim() }}),
        )
    };
    let r = reqwest::Client::new()
        .post(url)
        .header("xi-api-key", key)
        .json(&body)
        .timeout(std::time::Duration::from_secs(300))
        .send()
        .await
        .map_err(|e| format!("เรียก ElevenLabs ไม่ได้: {e}"))?;
    let status = r.status();
    if !status.is_success() {
        let t = r.text().await.unwrap_or_default();
        return Err(format!("ElevenLabs ตอบ {status}: {}", tail_chars(&t, 400)));
    }
    let b = r.bytes().await.map_err(|e| e.to_string())?;
    std::fs::write(out, &b).map_err(|e| e.to_string())
}
