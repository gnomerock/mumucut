use crate::models::*;
use crate::state::{hide_window, AppState, RunInfo};
use crate::util::*;
use crate::{ai, db, ffcheck};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::Command;

const LOG_CAP: usize = 300_000;

pub struct Logger<R: Runtime> {
    app: AppHandle<R>,
    clip_id: i64,
    step: String,
    buf: Arc<Mutex<String>>,
}

impl<R: Runtime> Clone for Logger<R> {
    fn clone(&self) -> Self {
        Logger { app: self.app.clone(), clip_id: self.clip_id, step: self.step.clone(), buf: self.buf.clone() }
    }
}

impl<R: Runtime> Logger<R> {
    pub fn line(&self, stream: &str, line: &str) {
        {
            let mut b = self.buf.lock().unwrap();
            b.push_str(line);
            b.push('\n');
            if b.len() > LOG_CAP * 2 {
                let t = tail_chars(&b, LOG_CAP);
                *b = t;
            }
        }
        let _ = self.app.emit(
            "step-log",
            LogEvent { clip_id: self.clip_id, step: self.step.clone(), stream: stream.into(), line: line.into() },
        );
    }
    pub fn new(app: AppHandle<R>, clip_id: i64, step: &str) -> Self {
        Logger { app, clip_id, step: step.into(), buf: Arc::new(Mutex::new(String::new())) }
    }
    pub fn text(&self) -> String {
        tail_chars(&self.buf.lock().unwrap(), LOG_CAP)
    }
}

pub fn build_vars(project: &Project, clip: &Clip, cfg: &Config) -> HashMap<String, String> {
    let mut v: HashMap<String, String> = HashMap::new();
    v.insert("key".into(), clip.clip_key.clone());
    v.insert("title".into(), clip.title.clone());
    v.insert("ref".into(), clip.ref_.clone());
    v.insert("brief".into(), clip.brief.clone());
    v.insert("script".into(), clip.script.clone());
    v.insert("caption".into(), clip.caption.clone());
    v.insert("workdir".into(), project.workdir.clone());
    v.insert("library".into(), project.library_dir.clone());
    v.insert("width".into(), cfg.width.to_string());
    v.insert("height".into(), cfg.height.to_string());
    v.insert("fps".into(), cfg.fps.to_string());
    v.insert("max_seconds".into(), cfg.max_seconds.to_string());
    let n = serde_json::from_str::<Value>(&clip.script)
        .ok()
        .and_then(|j| j["lines"].as_array().map(|a| a.len()))
        .filter(|n| *n > 0)
        .unwrap_or(5);
    let ids: Vec<String> = (1..=n).map(|i| format!("{}_L{}", clip.clip_key, i)).collect();
    v.insert("line_ids".into(), ids.join(" "));
    v.insert("lines".into(), n.to_string());
    let simple: HashMap<String, String> = v.clone();
    let video = resolve(&project.workdir, &subst(&cfg.video_file, &simple));
    let cover = resolve(&project.workdir, &subst(&cfg.cover_file, &simple));
    v.insert("video".into(), norm_path(&video));
    v.insert("cover".into(), norm_path(&cover));
    v
}

async fn pump<T: AsyncRead + Unpin, R: Runtime>(r: T, logger: Logger<R>, stream: &'static str) {
    let mut rd = BufReader::new(r);
    let mut buf = Vec::new();
    loop {
        buf.clear();
        match rd.read_until(b'\n', &mut buf).await {
            Ok(0) | Err(_) => break,
            Ok(_) => {
                let s = String::from_utf8_lossy(&buf).to_string();
                // progress bars use \r: keep the last segment
                let line = s.trim_end_matches(['\n', '\r']).rsplit('\r').next().unwrap_or("").to_string();
                if !line.trim().is_empty() {
                    logger.line(stream, &line);
                }
            }
        }
    }
}

async fn run_shell<R: Runtime>(
    state: &AppState,
    logger: &Logger<R>,
    clip_id: i64,
    step: &str,
    script: &str,
    cwd: &str,
    env: &HashMap<String, String>,
) -> Result<(), String> {
    let dir = state.data_dir.join("run");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut text = String::from(
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\r\n$OutputEncoding = [System.Text.Encoding]::UTF8\r\n$ErrorActionPreference = 'Continue'\r\n",
    );
    let mut n = 0;
    for line in script.lines() {
        let l = line.trim();
        if l.is_empty() || l.starts_with('#') {
            continue;
        }
        n += 1;
        text.push_str(&format!(
            "$global:LASTEXITCODE = 0\r\n{l}\r\nif ($LASTEXITCODE -ne 0) {{ Write-Output \"[คำสั่งที่ {n} ล้มเหลว รหัส $LASTEXITCODE]\"; exit $LASTEXITCODE }}\r\n"
        ));
    }
    if n == 0 {
        return Err("ยังไม่ได้ตั้งคำสั่งของขั้นตอนนี้ (ไปที่หน้า โปรเจกต์ → ขั้นตอน)".into());
    }
    text.push_str("exit 0\r\n");
    let file = dir.join(format!("{clip_id}_{step}.ps1"));
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(text.as_bytes());
    std::fs::write(&file, bytes).map_err(|e| e.to_string())?;

    #[cfg(windows)]
    let mut cmd = {
        let mut c = Command::new("powershell.exe");
        c.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"]).arg(&file);
        c
    };
    #[cfg(not(windows))]
    let mut cmd = {
        let mut c = Command::new("sh");
        c.arg("-c").arg(script);
        c
    };
    if Path::new(cwd).is_dir() {
        cmd.current_dir(cwd);
    }
    cmd.env("PATH", state.child_path()).env("PYTHONIOENCODING", "utf-8");
    for (k, v) in env {
        cmd.env(k, v);
    }
    cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
    hide_window(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| format!("เปิดคำสั่งไม่ได้: {e}"))?;
    if let Some(pid) = child.id() {
        if let Some(r) = state.running.lock().unwrap().get_mut(&(clip_id, step.to_string())) {
            r.pid = pid;
        }
    }
    let o = tokio::spawn(pump(child.stdout.take().unwrap(), logger.clone(), "stdout"));
    let e = tokio::spawn(pump(child.stderr.take().unwrap(), logger.clone(), "stderr"));
    let status = child.wait().await.map_err(|e| e.to_string())?;
    let _ = o.await;
    let _ = e.await;
    let _ = std::fs::remove_file(&file);
    if status.success() {
        Ok(())
    } else {
        Err(format!("คำสั่งจบด้วยรหัส {}", status.code().map(|c| c.to_string()).unwrap_or("?".into())))
    }
}

fn read_pool_rows(pool: &Pool, workdir: &str) -> Result<Vec<Vec<String>>, String> {
    let files = glob_one(&resolve(workdir, &pool.csv));
    if files.is_empty() {
        return Err(format!("ไม่พบไฟล์คลังหัวข้อ: {}", pool.csv));
    }
    let mut rows = vec![];
    for f in files {
        let mut rd = csv::ReaderBuilder::new()
            .has_headers(true)
            .flexible(true)
            .from_path(&f)
            .map_err(|e| format!("เปิด {} ไม่ได้: {e}", f.display()))?;
        for rec in rd.records().flatten() {
            rows.push(rec.iter().map(|s| s.trim().to_string()).collect());
        }
    }
    Ok(rows)
}

fn col(row: &[String], i: i64) -> String {
    if i < 0 { String::new() } else { row.get(i as usize).cloned().unwrap_or_default() }
}

fn pick_next(state: &AppState, project: &Project, cfg: &Config, clip: &Clip) -> Result<(String, String, String), String> {
    let pool = &cfg.pool;
    if pool.csv.is_empty() {
        return Err("โปรเจกต์นี้ยังไม่ได้ตั้งไฟล์คลังหัวข้อ (CSV) ใช้ขั้นตอนนี้แบบกรอกเองในแท็บ ข้อมูล".into());
    }
    let rows = read_pool_rows(pool, &project.workdir)?;
    let used: Vec<String> = {
        let c = state.db.lock().unwrap();
        db::list_clips(&c, Some(project.id))?
            .into_iter()
            .filter(|x| x.id != clip.id && !x.ref_.is_empty())
            .map(|x| x.ref_)
            .collect()
    };
    let candidate = |allow_skipped: bool| -> Option<(String, String, String)> {
        for r in &rows {
            let num = col(r, pool.ref_col);
            if num.is_empty() {
                continue;
            }
            let rf = format!("{}{}", pool.ref_prefix, num);
            if used.contains(&rf) || !col(r, pool.used_col).is_empty() {
                continue;
            }
            if !allow_skipped && !pool.skip_rating.is_empty() && col(r, pool.rating_col).contains(&pool.skip_rating) {
                continue;
            }
            let brief = pool
                .brief_cols
                .iter()
                .map(|i| col(r, *i as i64))
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join("\n\n");
            return Some((rf, col(r, pool.title_col), brief));
        }
        None
    };
    candidate(false)
        .or_else(|| candidate(true))
        .ok_or_else(|| "คลังหัวข้อหมดแล้ว ต้องหาชุดใหม่ (ตามคู่มือหัวข้อ D)".to_string())
}

fn caption_from_json(j: &Value, ref_: &str) -> String {
    let mut s = j["caption"].as_str().unwrap_or("").trim().to_string();
    if !ref_.is_empty() {
        s.push_str(&format!("\n\nที่มา: {ref_}"));
    }
    if let Some(t) = j["tags"].as_str().filter(|t| !t.trim().is_empty()) {
        s.push_str(&format!("\n{}", t.trim()));
    }
    s
}

fn write_file(path: &Path, content: &str) -> Result<(), String> {
    if let Some(p) = path.parent() {
        std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, content).map_err(|e| format!("เขียน {} ไม่ได้: {e}", path.display()))
}

pub async fn execute<R: Runtime>(app: &AppHandle<R>, state: &AppState, clip_id: i64, step_key: &str) -> Result<StepRow, String> {
    execute_with(app, state, clip_id, step_key, None).await
}

/// Run one step. `submitted` = the answer of an AI step written by the flow agent itself (no provider call is made).
pub async fn execute_with<R: Runtime>(
    app: &AppHandle<R>,
    state: &AppState,
    clip_id: i64,
    step_key: &str,
    submitted: Option<String>,
) -> Result<StepRow, String> {
    let (project, clip) = {
        let c = state.db.lock().unwrap();
        let clip = db::get_clip(&c, clip_id)?;
        let project = db::get_project(&c, clip.project_id)?;
        (project, clip)
    };
    let cfg: Config = serde_json::from_value(project.config.clone()).map_err(|e| format!("ตั้งค่าโปรเจกต์ผิดรูปแบบ: {e}"))?;
    let def = cfg
        .steps
        .iter()
        .find(|s| s.key == step_key)
        .cloned()
        .ok_or_else(|| format!("ไม่มีขั้นตอน {step_key}"))?;
    let key = (clip_id, step_key.to_string());
    {
        let mut r = state.running.lock().unwrap();
        if r.contains_key(&key) {
            return Err("ขั้นตอนนี้กำลังรันอยู่".into());
        }
        if def.gpu && r.values().any(|i| i.gpu) {
            return Err("มีงานที่ใช้การ์ดจอรันอยู่ รอให้จบก่อน (GPU 8 GB รันได้ทีละโปรแกรม)".into());
        }
        r.insert(key.clone(), RunInfo { pid: 0, gpu: def.gpu });
    }
    {
        let c = state.db.lock().unwrap();
        db::set_step(&c, clip_id, step_key, "running", Some(""), None, true, false)?;
        if clip.status == "draft" {
            let _ = c.execute("UPDATE clips SET status = 'making' WHERE id = ?1", [clip_id]);
        }
    }
    let _ = app.emit("step-status", StatusEvent { clip_id, step: step_key.into(), status: "running".into() });

    let logger = Logger { app: app.clone(), clip_id, step: step_key.into(), buf: Arc::new(Mutex::new(String::new())) };
    let vars = build_vars(&project, &clip, &cfg);
    let mut env: HashMap<String, String> = HashMap::new();
    env.insert("CLIP_KEY".into(), clip.clip_key.clone());
    env.insert("CLIP_TITLE".into(), clip.title.clone());
    env.insert("CLIP_REF".into(), clip.ref_.clone());
    env.insert("CLIP_WORKDIR".into(), project.workdir.clone());

    let result: Result<String, String> = async {
        match def.kind.as_str() {
            "pick" => {
                let (r, t, b) = pick_next(state, &project, &cfg, &clip)?;
                let c = state.db.lock().unwrap();
                c.execute(
                    "UPDATE clips SET ref = ?2, title = ?3, brief = ?4, updated_at = ?5 WHERE id = ?1",
                    rusqlite::params![clip_id, r, t, b, db::now()],
                )
                .map_err(|e| e.to_string())?;
                Ok(format!("เลือกแล้ว: {r}: {t}"))
            }
            "shell" => {
                run_shell(state, &logger, clip_id, step_key, &subst(&def.cmd, &vars), &project.workdir, &env).await?;
                Ok("เสร็จ".into())
            }
            "ai" => {
                let prompt = subst(&def.prompt, &vars);
                let answer = match &submitted {
                    Some(a) => {
                        logger.line("info", "รับคำตอบจาก agent ที่คุม flow");
                        a.clone()
                    }
                    None => {
                        if prompt.trim().is_empty() {
                            return Err("ยังไม่ได้ตั้ง prompt ของขั้นตอนนี้".into());
                        }
                        let agent = {
                            let c = state.db.lock().unwrap();
                            let id = if def.agent.is_empty() { cfg.flow_agent.clone() } else { def.agent.clone() };
                            db::pick_agent(&c, &id)
                        }
                        .ok_or("ยังไม่มี AI agent (ไปที่ ตั้งค่า, AI agents)")?;
                        let model = if agent.model.is_empty() { String::new() } else { format!(", {}", agent.model) };
                        logger.line("info", &format!("เรียก agent {} ({}{})", agent.name, agent.provider, model));
                        let lg = logger.clone();
                        ai::complete(state, &agent, &prompt, &project.workdir, move |s, l| lg.line(s, l)).await?
                    }
                };
                let mut summary = String::from("AI ตอบแล้ว");
                let mut parsed: Option<Value> = None;
                if !def.output_file.is_empty() || !def.merge_into.is_empty() {
                    parsed = Some(ai::extract_json(&answer)?);
                }
                if !def.output_file.is_empty() {
                    let p = resolve(&project.workdir, &subst(&def.output_file, &vars));
                    let content = serde_json::to_string_pretty(parsed.as_ref().unwrap()).map_err(|e| e.to_string())?;
                    write_file(&p, &content)?;
                    summary = format!("บันทึก {}", norm_path(&p));
                    if step_key == "script" {
                        let c = state.db.lock().unwrap();
                        let _ = c.execute("UPDATE clips SET script = ?2 WHERE id = ?1", rusqlite::params![clip_id, content]);
                    }
                    if step_key == "caption" {
                        let cap = caption_from_json(parsed.as_ref().unwrap(), &clip.ref_);
                        let c = state.db.lock().unwrap();
                        let _ = c.execute("UPDATE clips SET caption = ?2 WHERE id = ?1", rusqlite::params![clip_id, cap]);
                    }
                }
                if !def.merge_into.is_empty() {
                    let p = resolve(&project.workdir, &subst(&def.merge_into, &vars));
                    let mut target: Value = std::fs::read_to_string(&p)
                        .ok()
                        .and_then(|t| serde_json::from_str(&t).ok())
                        .unwrap_or_else(|| json!({}));
                    let add = parsed.as_ref().and_then(|v| v.as_object()).ok_or("คำตอบ AI ต้องเป็น JSON object เพื่อรวมเข้าไฟล์")?;
                    if let Some(obj) = target.as_object_mut() {
                        for (k, v) in add {
                            obj.insert(k.clone(), v.clone());
                        }
                    }
                    write_file(&p, &serde_json::to_string_pretty(&target).map_err(|e| e.to_string())?)?;
                    summary = format!("รวมเข้า {}", norm_path(&p));
                    if step_key == "script" {
                        let c = state.db.lock().unwrap();
                        let _ = c.execute(
                            "UPDATE clips SET script = ?2 WHERE id = ?1",
                            rusqlite::params![clip_id, serde_json::to_string_pretty(&target).unwrap_or_default()],
                        );
                    }
                }
                logger.line("info", &summary);
                if !def.cmd.trim().is_empty() {
                    // the file written above may have changed the clip (script/caption): refresh vars
                    let fresh = {
                        let c = state.db.lock().unwrap();
                        db::get_clip(&c, clip_id)?
                    };
                    let v2 = build_vars(&project, &fresh, &cfg);
                    run_shell(state, &logger, clip_id, step_key, &subst(&def.cmd, &v2), &project.workdir, &env).await?;
                }
                Ok(summary)
            }
            "check" => {
                let video = PathBuf::from(vars.get("video").cloned().unwrap_or_default());
                logger.line("info", &format!("ตรวจ {}", video.display()));
                let rep = ffcheck::check_video(state, &video, &cfg).await?;
                for i in &rep.items {
                    logger.line("info", &format!("{} {}: {} (ต้อง {})", if i.ok { "✓" } else { "✗" }, i.name, i.value, i.expect));
                }
                {
                    let cover = PathBuf::from(vars.get("cover").cloned().unwrap_or_default());
                    let c = state.db.lock().unwrap();
                    let _ = c.execute(
                        "UPDATE clips SET video_path = ?2, cover_path = ?3, duration = ?4, lufs = ?5 WHERE id = ?1",
                        rusqlite::params![
                            clip_id,
                            norm_path(&video),
                            if cover.is_file() { Some(norm_path(&cover)) } else { None },
                            rep.duration,
                            rep.lufs
                        ],
                    );
                }
                if rep.ok {
                    Ok(format!("ผ่านทุกข้อ ({:.1} วิ)", rep.duration))
                } else {
                    let bad: Vec<String> = rep.items.iter().filter(|i| !i.ok).map(|i| i.name.clone()).collect();
                    Err(format!("ไม่ผ่าน: {}", bad.join(", ")))
                }
            }
            "deliver" => deliver(state, &project, &cfg, clip_id, &vars, &logger),
            _ => Err("ขั้นตอนนี้ให้กดยืนยันเอง (ไม่มีคำสั่งอัตโนมัติ)".into()),
        }
    }
    .await;

    state.running.lock().unwrap().remove(&key);
    let (status, exit) = match &result {
        Ok(msg) => {
            logger.line("info", &format!("✓ {msg}"));
            (if def.gate { "review" } else { "done" }, Some(0))
        }
        Err(e) => {
            logger.line("error", &format!("✗ {e}"));
            ("failed", Some(1))
        }
    };
    let row = {
        let c = state.db.lock().unwrap();
        db::set_step(&c, clip_id, step_key, status, Some(&logger.text()), exit, false, true)?;
        db::get_step(&c, clip_id, step_key).ok_or("บันทึกขั้นตอนไม่สำเร็จ")?
    };
    let _ = app.emit("step-status", StatusEvent { clip_id, step: step_key.into(), status: status.into() });
    Ok(row)
}

fn deliver<R: Runtime>(
    state: &AppState,
    project: &Project,
    cfg: &Config,
    clip_id: i64,
    vars: &HashMap<String, String>,
    logger: &Logger<R>,
) -> Result<String, String> {
    let clip = {
        let c = state.db.lock().unwrap();
        db::get_clip(&c, clip_id)?
    };
    let video = PathBuf::from(vars.get("video").cloned().unwrap_or_default());
    if !video.is_file() {
        return Err(format!("ไม่พบไฟล์วิดีโอ {} (ต้อง render ก่อน)", video.display()));
    }
    if project.library_dir.trim().is_empty() {
        return Err("ยังไม่ได้ตั้งโฟลเดอร์คลังของโปรเจกต์".into());
    }
    let dest = Path::new(&project.library_dir).join(&clip.clip_key);
    std::fs::create_dir_all(&dest).map_err(|e| format!("สร้างโฟลเดอร์คลังไม่ได้: {e}"))?;
    let vdest = dest.join(format!("{}.mp4", clip.clip_key));
    std::fs::copy(&video, &vdest).map_err(|e| format!("คัดลอกวิดีโอไม่ได้: {e}"))?;
    logger.line("info", &format!("คัดลอก {}", norm_path(&vdest)));
    let cover = PathBuf::from(vars.get("cover").cloned().unwrap_or_default());
    let mut cdest: Option<PathBuf> = None;
    if cover.is_file() {
        let d = dest.join(format!("{}_cover.jpg", clip.clip_key));
        std::fs::copy(&cover, &d).map_err(|e| e.to_string())?;
        logger.line("info", &format!("คัดลอก {}", norm_path(&d)));
        cdest = Some(d);
    } else {
        logger.line("info", "ไม่พบภาพปก (ข้าม)");
    }
    for pat in &cfg.extra_files {
        let p = resolve(&project.workdir, &subst(pat, vars));
        for f in glob_one(&p) {
            if let Some(name) = f.file_name() {
                std::fs::copy(&f, dest.join(name)).map_err(|e| e.to_string())?;
                logger.line("info", &format!("คัดลอก {}", name.to_string_lossy()));
            }
        }
    }
    if !clip.caption.trim().is_empty() {
        write_file(&dest.join("caption.txt"), &clip.caption)?;
    }
    let meta = json!({
        "clip_key": clip.clip_key, "title": clip.title, "ref": clip.ref_,
        "length_s": clip.duration, "loudness_lufs": clip.lufs,
        "video_file": norm_path(&vdest), "cover_file": cdest.as_ref().map(|p| norm_path(p)),
        "caption_text": clip.caption, "status": "ready", "created_by": "mumucut",
        "created_at": db::now(),
    });
    write_file(&dest.join("meta.json"), &serde_json::to_string_pretty(&meta).unwrap())?;
    let c = state.db.lock().unwrap();
    c.execute(
        "UPDATE clips SET video_path = ?2, cover_path = ?3, status = 'ready', updated_at = ?4 WHERE id = ?1",
        rusqlite::params![clip_id, norm_path(&vdest), cdest.map(|p| norm_path(&p)), db::now()],
    )
    .map_err(|e| e.to_string())?;
    Ok(format!("ลงคลังแล้ว: {} (สถานะ พร้อมโพสต์)", norm_path(&dest)))
}

pub fn kill_pid(pid: u32) {
    #[cfg(windows)]
    {
        let mut c = std::process::Command::new("taskkill");
        c.args(["/PID", &pid.to_string(), "/T", "/F"]);
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000);
        let _ = c.output();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("kill").args(["-9", &pid.to_string()]).output();
    }
}

