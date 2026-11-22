//! The flow agent: an AI agent runs a whole clip through the project's steps.
//!
//! MumuCut starts a small tool server on 127.0.0.1 (MCP over HTTP, JSON-RPC). The agent CLI is started with
//! only these tools: no shell, no file access of its own. Every call carries a per-run token that is tied to
//! one clip, so an agent can only touch the clip it was started for.
//!
//! Rules enforced here, not left to the agent: steps run in order (a step waits until the earlier ones are done
//! or approved), a step with a review gate stops at "review" until a person approves it in the app, steps of
//! kind manual and post are never run by the agent, and files are read and written only inside the project folder.

use crate::models::*;
use crate::runner::{self, Logger};
use crate::state::AppState;
use crate::util::*;
use crate::{ai, db};
use serde_json::{json, Value};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

pub const FLOW_STEP: &str = "__flow__";
const MAX_BODY: usize = 6 * 1024 * 1024;
const MAX_READ: usize = 200 * 1024;

// ---------------------------------------------------------------- server

pub async fn start_server<R: Runtime>(app: AppHandle<R>) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").await.map_err(|e| format!("เปิด tool server ไม่ได้: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    app.state::<AppState>().mcp_port.store(port, Ordering::SeqCst);
    tauri::async_runtime::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((sock, _)) => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move { handle(app, sock).await });
                }
                Err(_) => tokio::time::sleep(std::time::Duration::from_millis(200)).await,
            }
        }
    });
    Ok(port)
}

struct Req {
    method: String,
    path: String,
    auth: String,
    body: Vec<u8>,
}

async fn read_request(sock: &mut TcpStream) -> Option<Req> {
    let mut buf: Vec<u8> = Vec::new();
    let mut tmp = [0u8; 8192];
    let head_end = loop {
        if let Some(i) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            break i;
        }
        if buf.len() > 64 * 1024 {
            return None;
        }
        let n = sock.read(&mut tmp).await.ok()?;
        if n == 0 {
            return None;
        }
        buf.extend_from_slice(&tmp[..n]);
    };
    let head = String::from_utf8_lossy(&buf[..head_end]).to_string();
    let mut lines = head.lines();
    let mut first = lines.next()?.split_whitespace();
    let method = first.next()?.to_string();
    let path = first.next()?.to_string();
    let mut len = 0usize;
    let mut auth = String::new();
    for l in lines {
        if let Some((k, v)) = l.split_once(':') {
            match k.trim().to_ascii_lowercase().as_str() {
                "content-length" => len = v.trim().parse().unwrap_or(0),
                "authorization" => auth = v.trim().to_string(),
                _ => {}
            }
        }
    }
    if len > MAX_BODY {
        return None;
    }
    let mut body = buf[head_end + 4..].to_vec();
    while body.len() < len {
        let n = sock.read(&mut tmp).await.ok()?;
        if n == 0 {
            return None;
        }
        body.extend_from_slice(&tmp[..n]);
    }
    body.truncate(len);
    Some(Req { method, path, auth, body })
}

async fn respond(sock: &mut TcpStream, status: u16, body: Option<&Value>) {
    let reason = match status {
        200 => "OK",
        202 => "Accepted",
        401 => "Unauthorized",
        404 => "Not Found",
        405 => "Method Not Allowed",
        _ => "Error",
    };
    let payload = body.map(|b| b.to_string()).unwrap_or_default();
    let head = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        payload.len()
    );
    let _ = sock.write_all(head.as_bytes()).await;
    let _ = sock.write_all(payload.as_bytes()).await;
    let _ = sock.shutdown().await;
}

async fn handle<R: Runtime>(app: AppHandle<R>, mut sock: TcpStream) {
    let Some(req) = read_request(&mut sock).await else { return };
    if req.path != "/mcp" {
        return respond(&mut sock, 404, None).await;
    }
    let token = req.auth.strip_prefix("Bearer ").unwrap_or("").trim().to_string();
    let clip_id = app.state::<AppState>().flows.lock().unwrap().get(&token).copied();
    let Some(clip_id) = clip_id else {
        return respond(&mut sock, 401, Some(&json!({"error": "unauthorized"}))).await;
    };
    match req.method.as_str() {
        "POST" => {}
        "DELETE" => return respond(&mut sock, 200, None).await,
        _ => return respond(&mut sock, 405, None).await,
    }
    let msg: Value = match serde_json::from_slice(&req.body) {
        Ok(v) => v,
        Err(_) => return respond(&mut sock, 200, Some(&rpc_error(Value::Null, -32700, "parse error"))).await,
    };
    match dispatch(&app, clip_id, &msg).await {
        Some(v) => respond(&mut sock, 200, Some(&v)).await,
        None => respond(&mut sock, 202, None).await,
    }
}

fn rpc_error(id: Value, code: i64, message: &str) -> Value {
    json!({"jsonrpc": "2.0", "id": id, "error": {"code": code, "message": message}})
}

/// One JSON-RPC message; None for notifications (no answer).
pub async fn dispatch<R: Runtime>(app: &AppHandle<R>, clip_id: i64, msg: &Value) -> Option<Value> {
    let id = msg.get("id").cloned();
    let method = msg["method"].as_str().unwrap_or("");
    let id = match id {
        Some(i) => i,
        None => return None, // notification, for example notifications/initialized
    };
    let ok = |result: Value| Some(json!({"jsonrpc": "2.0", "id": id, "result": result}));
    match method {
        "initialize" => {
            let ver = msg["params"]["protocolVersion"].as_str().unwrap_or("2025-03-26");
            ok(json!({
                "protocolVersion": ver,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "mumucut", "version": env!("CARGO_PKG_VERSION")}
            }))
        }
        "ping" => ok(json!({})),
        "tools/list" => ok(json!({"tools": tool_defs()})),
        "tools/call" => {
            let name = msg["params"]["name"].as_str().unwrap_or("").to_string();
            let args = msg["params"]["arguments"].clone();
            let (text, is_error) = match call_tool(app, clip_id, &name, &args).await {
                Ok(t) => (t, false),
                Err(e) => (e, true),
            };
            ok(json!({"content": [{"type": "text", "text": text}], "isError": is_error}))
        }
        _ => Some(rpc_error(id, -32601, "method not found")),
    }
}

fn tool_defs() -> Value {
    json!([
        {
            "name": "get_context",
            "description": "Read the clip, the project rules and every step with its status. Call this first and again after each step.",
            "inputSchema": {"type": "object", "properties": {}}
        },
        {
            "name": "run_step",
            "description": "Run one automatic step (kinds pick, shell, check, deliver). Returns the status and the end of the log. A step with a review gate ends in status review: stop and tell the person what to look at. Not for kind ai (use submit_step), manual or post.",
            "inputSchema": {"type": "object", "properties": {"step": {"type": "string", "description": "step key"}}, "required": ["step"]}
        },
        {
            "name": "submit_step",
            "description": "Give the answer of a step of kind ai. MumuCut saves it (JSON files, script, caption) and runs the step's follow-up command. content is the answer text, normally JSON in the format the step's prompt asks for.",
            "inputSchema": {"type": "object", "properties": {"step": {"type": "string"}, "content": {"type": "string"}}, "required": ["step", "content"]}
        },
        {
            "name": "update_clip",
            "description": "Set the clip's title, ref (source reference), brief (source text) or notes. Only the fields you give are changed.",
            "inputSchema": {"type": "object", "properties": {"title": {"type": "string"}, "ref": {"type": "string"}, "brief": {"type": "string"}, "notes": {"type": "string"}}}
        },
        {
            "name": "read_file",
            "description": "Read a text file inside the project folder (path relative to it, no ..). Up to 200 KB.",
            "inputSchema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}
        },
        {
            "name": "write_file",
            "description": "Write a text file inside the project folder (path relative to it, no ..). Use it to fix a spec file a failed step complained about.",
            "inputSchema": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]}
        },
        {
            "name": "log",
            "description": "Add a short note to the flow log that the person sees in MumuCut.",
            "inputSchema": {"type": "object", "properties": {"message": {"type": "string"}}, "required": ["message"]}
        }
    ])
}

// ---------------------------------------------------------------- tools

fn load(state: &AppState, clip_id: i64) -> Result<(Project, Clip, Config), String> {
    let c = state.db.lock().unwrap();
    let clip = db::get_clip(&c, clip_id)?;
    let project = db::get_project(&c, clip.project_id)?;
    let cfg: Config = serde_json::from_value(project.config.clone()).map_err(|e| format!("ตั้งค่าโปรเจกต์ผิดรูปแบบ: {e}"))?;
    Ok((project, clip, cfg))
}

/// A path the agent gives must stay inside the project folder.
pub fn scoped(workdir: &str, rel: &str) -> Result<PathBuf, String> {
    let rel = rel.trim().replace('\\', "/");
    if rel.is_empty() {
        return Err("path ว่างเปล่า".into());
    }
    let p = Path::new(&rel);
    if p.is_absolute() || rel.contains(':') {
        return Err("ใช้ path แบบสัมพัทธ์กับโฟลเดอร์งานเท่านั้น".into());
    }
    if p.components().any(|c| matches!(c, Component::ParentDir | Component::Prefix(_) | Component::RootDir)) {
        return Err("path ห้ามออกนอกโฟลเดอร์งาน (ห้ามมี ..)".into());
    }
    Ok(Path::new(workdir).join(p))
}

fn step_status(state: &AppState, clip_id: i64, key: &str) -> String {
    let c = state.db.lock().unwrap();
    db::get_step(&c, clip_id, key).map(|r| r.status).unwrap_or_else(|| "pending".into())
}

/// Every earlier step must be done (or skipped) before this one may run.
pub fn check_order(state: &AppState, clip_id: i64, cfg: &Config, key: &str) -> Result<(), String> {
    for s in &cfg.steps {
        if s.key == key {
            return Ok(());
        }
        let st = step_status(state, clip_id, &s.key);
        if st != "done" && st != "skipped" {
            let why = if st == "review" { "รอให้คนตรวจและกดอนุมัติในแอพ" } else { "ยังไม่เสร็จ" };
            return Err(format!("ทำขั้นตอน {} ({}) ก่อน: {} (สถานะ {})", s.label, s.key, why, st));
        }
    }
    Err(format!("ไม่มีขั้นตอน {key}"))
}

fn log_tail(log: &str, n: usize) -> String {
    let lines: Vec<&str> = log.lines().collect();
    let from = lines.len().saturating_sub(n);
    lines[from..].join("\n")
}

async fn call_tool<R: Runtime>(app: &AppHandle<R>, clip_id: i64, name: &str, a: &Value) -> Result<String, String> {
    let st = app.state::<AppState>();
    let state: &AppState = &st;
    let s = |k: &str| a[k].as_str().unwrap_or("").to_string();
    match name {
        "get_context" => {
            let (project, clip, cfg) = load(state, clip_id)?;
            let vars = runner::build_vars(&project, &clip, &cfg);
            let rows = { db::list_steps(&state.db.lock().unwrap(), clip_id)? };
            let steps: Vec<Value> = cfg
                .steps
                .iter()
                .map(|d| {
                    let status = rows.iter().find(|r| r.step_key == d.key).map(|r| r.status.clone()).unwrap_or_else(|| "pending".into());
                    let mut v = json!({
                        "key": d.key, "label": d.label, "kind": d.kind, "description": d.desc,
                        "status": status, "review_gate": d.gate, "uses_gpu": d.gpu,
                    });
                    if d.kind == "ai" {
                        v["prompt"] = json!(subst(&d.prompt, &vars));
                        v["output_file"] = json!(subst(&d.output_file, &vars));
                    }
                    v
                })
                .collect();
            Ok(serde_json::to_string_pretty(&json!({
                "clip": {"key": clip.clip_key, "title": clip.title, "ref": clip.ref_, "status": clip.status, "brief": clip.brief, "script": clip.script, "caption": clip.caption, "notes": clip.notes},
                "project": {"name": project.name, "folder": project.workdir, "width": cfg.width, "height": cfg.height, "fps": cfg.fps, "max_seconds": cfg.max_seconds},
                "steps": steps,
            }))
            .unwrap())
        }
        "run_step" => {
            let key = s("step");
            let (_, _, cfg) = load(state, clip_id)?;
            let def = cfg.steps.iter().find(|d| d.key == key).ok_or_else(|| format!("ไม่มีขั้นตอน {key}"))?;
            match def.kind.as_str() {
                "ai" => return Err(format!("ขั้นตอน {key} เป็นชนิด ai: เขียนคำตอบเองแล้วส่งด้วย submit_step")),
                "manual" | "post" => return Err(format!("ขั้นตอน {key} เป็นงานของคน (ชนิด {}): agent ไม่ทำ ให้หยุดและแจ้งคน", def.kind)),
                _ => {}
            }
            check_order(state, clip_id, &cfg, &key)?;
            let row = runner::execute(app, state, clip_id, &key).await?;
            let mut out = format!("step {key}: {}\n{}", row.status, log_tail(&row.log, 60));
            match row.status.as_str() {
                "review" => out.push_str("\n\nขั้นตอนนี้ต้องให้คนตรวจก่อน (review gate): หยุดทำงานตอนนี้ แล้วรายงานว่าคนต้องดูอะไร ห้ามอนุมัติเอง"),
                "failed" => out.push_str("\n\nขั้นตอนล้มเหลว: อ่าน log ถ้าแก้ได้ให้แก้แล้วรันซ้ำ (ไม่เกิน 2 ครั้ง) ไม่ได้ให้หยุดและรายงาน"),
                _ => {}
            }
            Ok(out)
        }
        "submit_step" => {
            let key = s("step");
            let (_, _, cfg) = load(state, clip_id)?;
            let def = cfg.steps.iter().find(|d| d.key == key).ok_or_else(|| format!("ไม่มีขั้นตอน {key}"))?;
            if def.kind != "ai" {
                return Err(format!("submit_step ใช้กับขั้นตอนชนิด ai เท่านั้น ขั้นตอน {key} เป็นชนิด {}: ใช้ run_step", def.kind));
            }
            check_order(state, clip_id, &cfg, &key)?;
            let content = s("content");
            if content.trim().is_empty() {
                return Err("content ว่างเปล่า".into());
            }
            let row = runner::execute_with(app, state, clip_id, &key, Some(content)).await?;
            let mut out = format!("step {key}: {}\n{}", row.status, log_tail(&row.log, 40));
            if row.status == "review" {
                out.push_str("\n\nขั้นตอนนี้ต้องให้คนตรวจก่อน (review gate): หยุดทำงานตอนนี้ แล้วรายงานว่าคนต้องดูอะไร ห้ามอนุมัติเอง");
            }
            if row.status == "failed" {
                out.push_str("\n\nคำตอบใช้ไม่ได้: แก้รูปแบบตามข้อความข้างบนแล้วส่งใหม่ (ไม่เกิน 2 ครั้ง)");
            }
            Ok(out)
        }
        "update_clip" => {
            let c = state.db.lock().unwrap();
            let cur = db::get_clip(&c, clip_id)?;
            let pick = |k: &str, old: &str| a[k].as_str().map(|v| v.to_string()).unwrap_or_else(|| old.to_string());
            c.execute(
                "UPDATE clips SET title=?2, ref=?3, brief=?4, notes=?5, updated_at=?6 WHERE id=?1",
                rusqlite::params![clip_id, pick("title", &cur.title), pick("ref", &cur.ref_), pick("brief", &cur.brief), pick("notes", &cur.notes), db::now()],
            )
            .map_err(|e| e.to_string())?;
            Ok("บันทึกแล้ว".into())
        }
        "read_file" => {
            let (project, _, _) = load(state, clip_id)?;
            let p = scoped(&project.workdir, &s("path"))?;
            let text = std::fs::read_to_string(&p).map_err(|e| format!("อ่านไม่ได้: {e}"))?;
            if text.len() > MAX_READ {
                let cut: String = text.chars().take(MAX_READ / 3).collect();
                return Ok(format!("{cut}\n[ไฟล์ยาวเกิน 200 KB ตัดแล้ว]"));
            }
            Ok(text)
        }
        "write_file" => {
            let (project, _, _) = load(state, clip_id)?;
            let p = scoped(&project.workdir, &s("path"))?;
            if let Some(dir) = p.parent() {
                std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
            }
            let content = s("content");
            std::fs::write(&p, &content).map_err(|e| format!("เขียนไม่ได้: {e}"))?;
            Ok(format!("เขียน {} ({} ตัวอักษร)", norm_path(&p), content.chars().count()))
        }
        "log" => {
            let _ = app.emit("step-log", LogEvent { clip_id, step: FLOW_STEP.into(), stream: "agent".into(), line: s("message") });
            Ok("ok".into())
        }
        other => Err(format!("ไม่มีเครื่องมือ {other}")),
    }
}

// ---------------------------------------------------------------- flow run

const DEFAULT_FLOW_PROMPT: &str = r#"You are {agent}, the flow agent of MumuCut, a desktop app that makes short vertical video clips. You take one clip through its production flow by calling the tools of the "mumucut" MCP server. You have no shell and no file access except through those tools.

The clip is {key}. Work like this:
1. Call get_context first. It shows the clip, the project rules and every step with its status.
2. Go through the steps in order and skip the ones that are done.
   - kind "ai": read the step's prompt in get_context, write the answer yourself, then call submit_step. Follow the output format of the prompt exactly (normally JSON).
   - kind "pick", "shell", "check", "deliver": call run_step and read the log it returns. If it failed, read the log; if you can fix the cause (a spec file with write_file, a wrong answer with submit_step) do it and run the step again, at most 2 retries of the same step, then stop and report.
   - kind "manual" and "post": never do them, a person does. Stop there.
3. A step with a review gate ends in status "review". A person must look at the result. Stop at once, do not approve it yourself, and say what the person should look at.
4. Never post, publish or upload anything. Never invent facts that the step prompts and the clip did not give.
5. When you stop (review gate, failure or end of the flow) write a short report in Thai: what is done, what comes next, and anything a person must check.
"#;

fn build_flow_prompt(agent: &Agent, cfg: &Config, clip: &Clip) -> String {
    let base = if cfg.flow_prompt.trim().is_empty() { DEFAULT_FLOW_PROMPT.to_string() } else { cfg.flow_prompt.clone() };
    let mut p = base.replace("{agent}", &agent.name).replace("{key}", &clip.clip_key);
    if !agent.instructions.trim().is_empty() {
        p = format!("{}\n\n---\n\n{}", agent.instructions.trim(), p);
    }
    p
}

/// What to show the person for one line of the agent's output (claude stream-json, or plain text).
pub fn describe_stream_line(line: &str) -> Vec<(String, String)> {
    let t = line.trim();
    if t.is_empty() {
        return vec![];
    }
    let Ok(v) = serde_json::from_str::<Value>(t) else {
        return vec![("stdout".into(), t.to_string())];
    };
    let mut out = vec![];
    match v["type"].as_str() {
        Some("assistant") => {
            for c in v["message"]["content"].as_array().cloned().unwrap_or_default() {
                match c["type"].as_str() {
                    Some("text") => {
                        let text = c["text"].as_str().unwrap_or("").trim();
                        if !text.is_empty() {
                            out.push(("agent".to_string(), text.chars().take(1500).collect()));
                        }
                    }
                    Some("tool_use") => {
                        let n = c["name"].as_str().unwrap_or("").replace("mcp__mumucut__", "");
                        let arg = c["input"]["step"].as_str().map(|s| format!(" {s}")).unwrap_or_default();
                        out.push(("info".to_string(), format!("เรียก {n}{arg}")));
                    }
                    _ => {}
                }
            }
        }
        Some("result") if v["is_error"].as_bool() == Some(true) => {
            out.push(("error".to_string(), v["result"].as_str().unwrap_or("agent จบด้วยข้อผิดพลาด").to_string()));
        }
        _ => {}
    }
    out
}

pub async fn run_flow<R: Runtime>(app: &AppHandle<R>, state: &AppState, clip_id: i64) -> Result<String, String> {
    let (project, clip, cfg) = load(state, clip_id)?;
    let agent = {
        let c = state.db.lock().unwrap();
        db::pick_agent(&c, &cfg.flow_agent)
    }
    .ok_or("ยังไม่มี AI agent (ไปที่ ตั้งค่า, AI agents)")?;
    if !matches!(agent.provider.as_str(), "claude" | "custom") {
        return Err(format!(
            "agent {} ใช้ผู้ให้บริการ {} คุม flow ไม่ได้ ต้องเป็น Claude Code หรือ CLI ที่รองรับ MCP (แบบ API ใช้ได้เฉพาะขั้นตอนเขียนข้อความ)",
            agent.name, agent.provider
        ));
    }
    let port = state.mcp_port.load(Ordering::SeqCst);
    if port == 0 {
        return Err("tool server ยังไม่เริ่ม".into());
    }
    let key = (clip_id, FLOW_STEP.to_string());
    {
        let mut r = state.running.lock().unwrap();
        if r.contains_key(&key) {
            return Err("agent กำลังคุม flow ของคลิปนี้อยู่".into());
        }
        r.insert(key.clone(), crate::state::RunInfo { pid: 0, gpu: false });
    }
    let token = uuid::Uuid::new_v4().to_string();
    state.flows.lock().unwrap().insert(token.clone(), clip_id);
    {
        let c = state.db.lock().unwrap();
        let _ = db::set_step(&c, clip_id, FLOW_STEP, "running", Some(""), None, true, false);
        if clip.status == "draft" {
            let _ = c.execute("UPDATE clips SET status = 'making' WHERE id = ?1", [clip_id]);
        }
    }
    let _ = app.emit("step-status", StatusEvent { clip_id, step: FLOW_STEP.into(), status: "running".into() });
    let logger = Logger::new(app.clone(), clip_id, FLOW_STEP);

    let result: Result<(), String> = async {
        let url = format!("http://127.0.0.1:{port}/mcp");
        let mut cli = ai::cli_command(&agent)?;
        if agent.provider == "claude" {
            let dir = state.data_dir.join("run");
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let cfg_path = dir.join(format!("mcp_{clip_id}.json"));
            let conf = json!({"mcpServers": {"mumucut": {"type": "http", "url": url, "headers": {"Authorization": format!("Bearer {token}")}}}});
            std::fs::write(&cfg_path, conf.to_string()).map_err(|e| e.to_string())?;
            cli.push_str(&format!(
                " --strict-mcp-config --mcp-config \"{}\" --allowedTools \"mcp__mumucut\" --output-format stream-json --verbose",
                cfg_path.display()
            ));
        }
        let env = vec![
            ("MUMUCUT_MCP_URL".to_string(), url.clone()),
            ("MUMUCUT_MCP_TOKEN".to_string(), token.clone()),
            ("MCP_TOOL_TIMEOUT".to_string(), "3600000".to_string()),
            ("MCP_TIMEOUT".to_string(), "60000".to_string()),
        ];
        let model = if agent.model.is_empty() { String::new() } else { format!(", {}", agent.model) };
        logger.line("info", &format!("agent {} ({}{}) เริ่มคุม flow ของ {}", agent.name, agent.provider, model, clip.clip_key));
        let prompt = build_flow_prompt(&agent, &cfg, &clip);
        let lg = logger.clone();
        let claude = agent.provider == "claude";
        let key2 = key.clone();
        let st = state;
        ai::run_cli(
            state,
            &cli,
            &prompt,
            &project.workdir,
            &env,
            |pid| {
                if let Some(r) = st.running.lock().unwrap().get_mut(&key2) {
                    r.pid = pid;
                }
            },
            move |_, line| {
                if claude {
                    for (stream, text) in describe_stream_line(line) {
                        lg.line(&stream, &text);
                    }
                } else {
                    lg.line("agent", line);
                }
            },
        )
        .await
        .map(|_| ())
    }
    .await;

    state.flows.lock().unwrap().remove(&token);
    state.running.lock().unwrap().remove(&key);
    let _ = std::fs::remove_file(state.data_dir.join("run").join(format!("mcp_{clip_id}.json")));
    let status = if result.is_ok() { "done" } else { "failed" };
    match &result {
        Ok(()) => logger.line("info", "✓ agent จบการทำงาน (ดูสถานะแต่ละขั้นตอนทางซ้าย)"),
        Err(e) => logger.line("error", &format!("✗ {e}")),
    }
    {
        let c = state.db.lock().unwrap();
        let _ = db::set_step(&c, clip_id, FLOW_STEP, status, Some(&logger.text()), Some(if result.is_ok() { 0 } else { 1 }), false, true);
    }
    let _ = app.emit("step-status", StatusEvent { clip_id, step: FLOW_STEP.into(), status: status.into() });
    result.map(|_| "agent จบการทำงาน".to_string())
}
