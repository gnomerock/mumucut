use crate::state::{hide_window, AppState};
use serde_json::{json, Value};
use std::process::Stdio;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;

const SERVICE: &str = "mumucut";
const USER: &str = "ai-api-key";

pub fn set_key(key: &str) -> Result<(), String> {
    keyring::Entry::new(SERVICE, USER)
        .and_then(|e| e.set_password(key))
        .map_err(|e| format!("บันทึกคีย์ไม่ได้: {e}"))
}

pub fn get_key() -> Option<String> {
    keyring::Entry::new(SERVICE, USER).ok()?.get_password().ok()
}

pub fn clear_key() -> Result<(), String> {
    match keyring::Entry::new(SERVICE, USER).and_then(|e| e.delete_credential()) {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("ลบคีย์ไม่ได้: {e}")),
    }
}

/// Run the configured agent CLI (e.g. `claude -p`), prompt on stdin, answer on stdout.
/// `on_line` receives every output line for the live log. Returns (answer, child pid is not tracked).
pub async fn complete_cli<F: FnMut(&str, &str) + Send>(
    state: &AppState,
    prompt: &str,
    cwd: &str,
    mut on_line: F,
) -> Result<String, String> {
    let cli = state.setting("ai_cli_cmd").unwrap_or_else(|| "claude -p".into());
    #[cfg(windows)]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.arg("/C").raw_arg(&cli);
        c
    };
    #[cfg(not(windows))]
    let mut cmd = {
        let mut c = Command::new("sh");
        c.arg("-c").arg(&cli);
        c
    };
    if !cwd.is_empty() && std::path::Path::new(cwd).is_dir() {
        cmd.current_dir(cwd);
    }
    cmd.env("PATH", state.child_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    hide_window(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| format!("เปิด CLI ไม่ได้ ({cli}): {e}"))?;
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
        return Err("CLI ไม่ตอบอะไรกลับมา".into());
    }
    Ok(answer)
}

/// Anthropic Messages API (key from the OS credential store).
pub async fn complete_api(state: &AppState, prompt: &str) -> Result<String, String> {
    let key = get_key().ok_or("ยังไม่ได้ตั้ง API key ในหน้าตั้งค่า")?;
    let base = state
        .setting("ai_api_base")
        .unwrap_or_else(|| "https://api.anthropic.com".into());
    let model = state.setting("ai_api_model").unwrap_or_else(|| "claude-sonnet-5-5".into());
    let body = json!({
        "model": model,
        "max_tokens": 8192,
        "messages": [{"role": "user", "content": prompt}]
    });
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
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
        .map(|a| a.iter().filter_map(|c| c["text"].as_str()).collect::<Vec<_>>().join(""))
        .unwrap_or_default();
    if text.trim().is_empty() {
        return Err("API ตอบว่างเปล่า".into());
    }
    Ok(text)
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

