use crate::models::Agent;
use crate::state::{hide_window, AppState};
use serde_json::{json, Value};
use std::process::Stdio;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;

const SERVICE: &str = "mumucut";
const LEGACY_USER: &str = "ai-api-key";

pub const PROVIDERS: &[&str] = &["claude", "codex", "custom", "anthropic-api", "openai-api"];
pub const EFFORTS: &[&str] = &["low", "medium", "high", "xhigh", "max"];

fn key_user(id: i64) -> String {
    format!("agent-{id}-api-key")
}

pub fn set_key(id: i64, key: &str) -> Result<(), String> {
    keyring::Entry::new(SERVICE, &key_user(id))
        .and_then(|e| e.set_password(key))
        .map_err(|e| format!("บันทึกคีย์ไม่ได้: {e}"))
}

pub fn get_key(id: i64) -> Option<String> {
    keyring::Entry::new(SERVICE, &key_user(id)).ok()?.get_password().ok()
}

pub fn clear_key(id: i64) -> Result<(), String> {
    match keyring::Entry::new(SERVICE, &key_user(id)).and_then(|e| e.delete_credential()) {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("ลบคีย์ไม่ได้: {e}")),
    }
}

/// The single key of the first version (before agents existed).
pub fn legacy_key() -> Option<String> {
    keyring::Entry::new(SERVICE, LEGACY_USER).ok()?.get_password().ok()
}

pub fn is_api(provider: &str) -> bool {
    provider == "anthropic-api" || provider == "openai-api"
}

/// A model name or effort goes into a command line: letters, digits and . _ : / - only.
fn safe_token(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | ':' | '/' | '-'))
}

pub fn validate(a: &Agent) -> Result<(), String> {
    if a.name.trim().is_empty() {
        return Err("ตั้งชื่อ agent ก่อน".into());
    }
    if !PROVIDERS.contains(&a.provider.as_str()) {
        return Err(format!("ไม่รู้จักผู้ให้บริการ {}", a.provider));
    }
    if !a.model.is_empty() && !safe_token(&a.model) {
        return Err("ชื่อโมเดลใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข . _ : / -".into());
    }
    if !a.effort.is_empty() && !EFFORTS.contains(&a.effort.as_str()) {
        return Err("ระดับความพยายามต้องเป็น low, medium, high, xhigh หรือ max".into());
    }
    if a.provider == "custom" && a.command.trim().is_empty() {
        return Err("ใส่คำสั่ง CLI ของ agent นี้ (รับ prompt ทาง stdin ตอบทาง stdout)".into());
    }
    if a.provider == "openai-api" && a.model.is_empty() {
        return Err("API แบบ OpenAI ต้องระบุชื่อโมเดล".into());
    }
    Ok(())
}

/// The command line a CLI agent runs (the prompt always goes to stdin, the answer comes on stdout).
pub fn cli_command(a: &Agent) -> Result<String, String> {
    validate(a)?;
    match a.provider.as_str() {
        "claude" => {
            // tools off: the agent only writes text, it must not touch files in the project folder
            let mut c = String::from("claude -p --tools \"\" --no-session-persistence --setting-sources \"\"");
            if !a.model.is_empty() {
                c.push_str(&format!(" --model {}", a.model));
            }
            if !a.effort.is_empty() {
                c.push_str(&format!(" --effort {}", a.effort));
            }
            Ok(c)
        }
        "codex" => {
            let mut c = String::from("codex exec --skip-git-repo-check --ephemeral -s read-only");
            if !a.model.is_empty() {
                c.push_str(&format!(" -m {}", a.model));
            }
            Ok(c)
        }
        "custom" => Ok(a.command.trim().to_string()),
        p => Err(format!("{p} ไม่ใช่ผู้ให้บริการแบบ CLI")),
    }
}

/// Instructions of the agent come first, then the step's own prompt.
pub fn compose_prompt(a: &Agent, prompt: &str) -> String {
    if a.instructions.trim().is_empty() {
        prompt.to_string()
    } else {
        format!("{}\n\n---\n\n{}", a.instructions.trim(), prompt)
    }
}

/// First word of the command, to see whether the program exists.
pub fn cli_program(a: &Agent) -> Option<String> {
    let c = cli_command(a).ok()?;
    let c = c.trim();
    let first = if let Some(rest) = c.strip_prefix('"') { rest.split('"').next()?.to_string() } else { c.split_whitespace().next()?.to_string() };
    Some(first)
}

pub async fn complete<F: FnMut(&str, &str) + Send>(
    state: &AppState,
    agent: &Agent,
    prompt: &str,
    cwd: &str,
    on_line: F,
) -> Result<String, String> {
    match agent.provider.as_str() {
        "anthropic-api" => complete_anthropic(agent, prompt).await,
        "openai-api" => complete_openai(agent, prompt).await,
        _ => {
            let cli = cli_command(agent)?;
            run_cli(state, &cli, &compose_prompt(agent, prompt), cwd, &[], |_| {}, on_line).await
        }
    }
}

/// Run a CLI agent: prompt on stdin, answer on stdout. `on_line` receives every output line for the live log.
pub async fn run_cli<F: FnMut(&str, &str) + Send>(
    state: &AppState,
    cli: &str,
    prompt: &str,
    cwd: &str,
    env: &[(String, String)],
    on_pid: impl FnOnce(u32),
    mut on_line: F,
) -> Result<String, String> {
    #[cfg(windows)]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.arg("/C").raw_arg(cli);
        c
    };
    #[cfg(not(windows))]
    let mut cmd = {
        let mut c = Command::new("sh");
        c.arg("-c").arg(cli);
        c
    };
    if !cwd.is_empty() && std::path::Path::new(cwd).is_dir() {
        cmd.current_dir(cwd);
    }
    for (k, v) in env {
        cmd.env(k, v);
    }
    cmd.env("PATH", state.child_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    hide_window(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| format!("เปิด CLI ไม่ได้ ({cli}): {e}"))?;
    if let Some(pid) = child.id() {
        on_pid(pid);
    }
    let mut stdin = child.stdin.take().ok_or("ไม่มี stdin")?;
    let mut stdout = child.stdout.take().ok_or("ไม่มี stdout")?;
    let mut stderr = child.stderr.take().ok_or("ไม่มี stderr")?;
    let data = prompt.as_bytes().to_vec();
    let writer = tokio::spawn(async move {
        let _ = stdin.write_all(&data).await;
        let _ = stdin.shutdown().await;
    });
    let err_task = tokio::spawn(async move {
        let mut b = vec![];
        let _ = stderr.read_to_end(&mut b).await;
        String::from_utf8_lossy(&b).to_string()
    });
    let mut answer = String::new();
    let mut buf = [0u8; 4096];
    let mut pending = String::new();
    loop {
        let n = stdout.read(&mut buf).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
        answer.push_str(&chunk);
        pending.push_str(&chunk);
        while let Some(i) = pending.find('\n') {
            let line: String = pending.drain(..=i).collect();
            on_line("stdout", line.trim_end());
        }
    }
    if !pending.trim().is_empty() {
        on_line("stdout", pending.trim_end());
    }
    let _ = writer.await;
    let status = child.wait().await.map_err(|e| e.to_string())?;
    let err = err_task.await.unwrap_or_default();
    if !status.success() {
        let tail: String = err.chars().rev().take(600).collect::<Vec<_>>().into_iter().rev().collect();
        return Err(format!("CLI จบด้วยรหัส {:?}: {}", status.code(), tail.trim()));
    }
    if answer.trim().is_empty() {
        let tail: String = err.chars().rev().take(400).collect::<Vec<_>>().into_iter().rev().collect();
        return Err(format!("CLI ไม่ตอบอะไรกลับมา {}", tail.trim()));
    }
    Ok(answer)
}

fn http() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())
}

/// Anthropic Messages API.
async fn complete_anthropic(a: &Agent, prompt: &str) -> Result<String, String> {
    let key = get_key(a.id).ok_or("ยังไม่ได้ตั้ง API key ของ agent นี้")?;
    let base = if a.api_base.trim().is_empty() { "https://api.anthropic.com" } else { a.api_base.trim() };
    let model = if a.model.is_empty() { "claude-sonnet-5-5" } else { a.model.as_str() };
    let mut body = json!({
        "model": model,
        "max_tokens": 8192,
        "messages": [{"role": "user", "content": prompt}]
    });
    if !a.instructions.trim().is_empty() {
        body["system"] = json!(a.instructions.trim());
    }
    let resp = http()?
        .post(format!("{}/v1/messages", base.trim_end_matches('/')))
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("เรียก API ไม่ได้: {e}"))?;
    let status = resp.status();
    let v: Value = resp.json().await.map_err(|e| format!("อ่านคำตอบ API ไม่ได้: {e}"))?;
    if !status.is_success() {
        let msg = v["error"]["message"].as_str().unwrap_or("ไม่ทราบสาเหตุ");
        return Err(format!("API ตอบ {status}: {msg}"));
    }
    let text: String = v["content"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|c| c["text"].as_str()).collect::<Vec<_>>().join(""))
        .unwrap_or_default();
    if text.trim().is_empty() {
        return Err("API ตอบว่างเปล่า".into());
    }
    Ok(text)
}

/// OpenAI compatible chat completions (OpenAI, OpenRouter, Ollama, LM Studio ...). The key is optional for local servers.
async fn complete_openai(a: &Agent, prompt: &str) -> Result<String, String> {
    let base = if a.api_base.trim().is_empty() { "https://api.openai.com/v1" } else { a.api_base.trim() };
    let mut messages = vec![];
    if !a.instructions.trim().is_empty() {
        messages.push(json!({"role": "system", "content": a.instructions.trim()}));
    }
    messages.push(json!({"role": "user", "content": prompt}));
    let body = json!({ "model": a.model, "messages": messages });
    let mut req = http()?.post(format!("{}/chat/completions", base.trim_end_matches('/'))).json(&body);
    match get_key(a.id) {
        Some(k) => req = req.bearer_auth(k),
        None if !openai_keyless(base) => return Err("ยังไม่ได้ตั้ง API key ของ agent นี้".into()),
        None => {}
    }
    let resp = req.send().await.map_err(|e| format!("เรียก API ไม่ได้: {e}"))?;
    let status = resp.status();
    let v: Value = resp.json().await.map_err(|e| format!("อ่านคำตอบ API ไม่ได้: {e}"))?;
    if !status.is_success() {
        let msg = v["error"]["message"].as_str().unwrap_or("ไม่ทราบสาเหตุ");
        return Err(format!("API ตอบ {status}: {msg}"));
    }
    let text = v["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string();
    if text.trim().is_empty() {
        return Err("API ตอบว่างเปล่า".into());
    }
    Ok(text)
}

pub fn openai_keyless(base: &str) -> bool {
    base.contains("://localhost") || base.contains("://127.0.0.1")
}

/// Strip code fences / chatter and return the JSON part of an answer.
pub fn extract_json(text: &str) -> Result<Value, String> {
    let t = text.trim();
    if let Ok(v) = serde_json::from_str::<Value>(t) {
        return Ok(v);
    }
    let start = t.find(['{', '[']).ok_or("ไม่พบ JSON ในคำตอบของ AI")?;
    let end = t.rfind(['}', ']']).ok_or("ไม่พบ JSON ในคำตอบของ AI")?;
    if end <= start {
        return Err("ไม่พบ JSON ในคำตอบของ AI".into());
    }
    serde_json::from_str(&t[start..=end]).map_err(|e| format!("JSON จาก AI ไม่ถูกต้อง: {e}"))
}
