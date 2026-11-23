use crate::models::*;
use rusqlite::{params, Connection, Row};
use std::path::Path;

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  workdir     TEXT NOT NULL,
  library_dir TEXT NOT NULL,
  key_prefix  TEXT NOT NULL,
  config      TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS clips (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  clip_key   TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  ref        TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'draft',
  brief      TEXT NOT NULL DEFAULT '',
  script     TEXT NOT NULL DEFAULT '',
  caption    TEXT NOT NULL DEFAULT '',
  video_path TEXT,
  cover_path TEXT,
  duration   REAL,
  lufs       REAL,
  notes      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, clip_key)
);
CREATE TABLE IF NOT EXISTS steps (
  clip_id     INTEGER NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  step_key    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  log         TEXT NOT NULL DEFAULT '',
  exit_code   INTEGER,
  started_at  TEXT,
  finished_at TEXT,
  PRIMARY KEY (clip_id, step_key)
);
CREATE TABLE IF NOT EXISTS posts (
  id           INTEGER PRIMARY KEY,
  clip_id      INTEGER NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL,
  scheduled_at TEXT NOT NULL DEFAULT '',
  url          TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'scheduled',
  note         TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS agents (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  title        TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  provider     TEXT NOT NULL DEFAULT 'claude',
  model        TEXT NOT NULL DEFAULT '',
  effort       TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  command      TEXT NOT NULL DEFAULT '',
  api_base     TEXT NOT NULL DEFAULT '',
  is_default   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_clips_project ON clips(project_id, status);
-- files used by clips. clip_id NULL = the shared assets library; channel_id NULL = shared by every channel
CREATE TABLE IF NOT EXISTS assets (
  id         INTEGER PRIMARY KEY,
  channel_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  clip_id    INTEGER REFERENCES clips(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'file',
  name       TEXT NOT NULL,
  path       TEXT NOT NULL,
  tags       TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT '',
  source     TEXT NOT NULL DEFAULT 'file',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_assets_scope ON assets(channel_id, clip_id);
-- affiliate links library; channel_id NULL = usable in every channel
CREATE TABLE IF NOT EXISTS affiliate_links (
  id         INTEGER PRIMARY KEY,
  channel_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  platform   TEXT NOT NULL DEFAULT 'other',
  title      TEXT NOT NULL DEFAULT '',
  url        TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  tags       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS clip_affiliates (
  clip_id   INTEGER NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  link_id   INTEGER NOT NULL REFERENCES affiliate_links(id) ON DELETE CASCADE,
  placement TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (clip_id, link_id)
);
-- social media accounts a channel posts to (tokens live in the Windows Credential Manager)
CREATE TABLE IF NOT EXISTS social_accounts (
  id         INTEGER PRIMARY KEY,
  channel_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  platform   TEXT NOT NULL,
  name       TEXT NOT NULL DEFAULT '',
  handle     TEXT NOT NULL DEFAULT '',
  url        TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"#;

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let c = Connection::open(path)?;
    c.pragma_update(None, "journal_mode", "WAL")?;
    c.pragma_update(None, "foreign_keys", true)?;
    c.execute_batch(SCHEMA)?;
    seed_agents(&c);
    Ok(c)
}

pub fn now() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

const CLIP_COLS: &str = "c.id, c.project_id, c.clip_key, c.title, c.ref, c.status, c.brief, c.script, c.caption, c.video_path, c.cover_path, c.duration, c.lufs, c.notes, c.created_at, c.updated_at, (SELECT COUNT(*) FROM steps s WHERE s.clip_id = c.id AND s.status = 'done' AND s.step_key != '__flow__')";

fn clip_from_row(r: &Row) -> rusqlite::Result<Clip> {
    Ok(Clip {
        id: r.get(0)?,
        project_id: r.get(1)?,
        clip_key: r.get(2)?,
        title: r.get(3)?,
        ref_: r.get(4)?,
        status: r.get(5)?,
        brief: r.get(6)?,
        script: r.get(7)?,
        caption: r.get(8)?,
        video_path: r.get(9)?,
        cover_path: r.get(10)?,
        duration: r.get(11)?,
        lufs: r.get(12)?,
        notes: r.get(13)?,
        created_at: r.get(14)?,
        updated_at: r.get(15)?,
        done_steps: r.get(16)?,
    })
}

pub fn get_clip(c: &Connection, id: i64) -> Result<Clip, String> {
    c.query_row(
        &format!("SELECT {CLIP_COLS} FROM clips c WHERE c.id = ?1"),
        params![id],
        clip_from_row,
    )
    .map_err(|e| format!("ไม่พบคลิป: {e}"))
}

pub fn list_clips(c: &Connection, project_id: Option<i64>) -> Result<Vec<Clip>, String> {
    let sql = format!(
        "SELECT {CLIP_COLS} FROM clips c WHERE (?1 IS NULL OR c.project_id = ?1) ORDER BY c.project_id, c.clip_key DESC"
    );
    let mut st = c.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = st
        .query_map(params![project_id], clip_from_row)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn project_from_row(r: &Row) -> rusqlite::Result<Project> {
    let cfg: String = r.get(5)?;
    Ok(Project {
        id: r.get(0)?,
        name: r.get(1)?,
        workdir: r.get(2)?,
        library_dir: r.get(3)?,
        key_prefix: r.get(4)?,
        config: serde_json::from_str(&cfg).unwrap_or(serde_json::Value::Null),
    })
}

pub fn get_project(c: &Connection, id: i64) -> Result<Project, String> {
    c.query_row(
        "SELECT id, name, workdir, library_dir, key_prefix, config FROM projects WHERE id = ?1",
        params![id],
        project_from_row,
    )
    .map_err(|e| format!("ไม่พบโปรเจกต์: {e}"))
}

pub fn list_steps(c: &Connection, clip_id: i64) -> Result<Vec<StepRow>, String> {
    let mut st = c
        .prepare("SELECT clip_id, step_key, status, log, exit_code, started_at, finished_at FROM steps WHERE clip_id = ?1")
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map(params![clip_id], |r| {
            Ok(StepRow {
                clip_id: r.get(0)?,
                step_key: r.get(1)?,
                status: r.get(2)?,
                log: r.get(3)?,
                exit_code: r.get(4)?,
                started_at: r.get(5)?,
                finished_at: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn get_step(c: &Connection, clip_id: i64, key: &str) -> Option<StepRow> {
    list_steps(c, clip_id)
        .ok()?
        .into_iter()
        .find(|s| s.step_key == key)
}

pub fn list_posts(c: &Connection, clip_id: Option<i64>) -> Result<Vec<Post>, String> {
    let mut st = c
        .prepare("SELECT p.id, p.clip_id, c.clip_key, c.title, p.platform, p.scheduled_at, p.url, p.status, p.note, p.created_at FROM posts p JOIN clips c ON c.id = p.clip_id WHERE (?1 IS NULL OR p.clip_id = ?1) ORDER BY p.scheduled_at DESC, p.id DESC")
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map(params![clip_id], |r| {
            Ok(Post {
                id: r.get(0)?,
                clip_id: r.get(1)?,
                clip_key: r.get(2)?,
                clip_title: r.get(3)?,
                platform: r.get(4)?,
                scheduled_at: r.get(5)?,
                url: r.get(6)?,
                status: r.get(7)?,
                note: r.get(8)?,
                created_at: r.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn get_setting(c: &Connection, key: &str) -> Option<String> {
    c.query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| r.get(0))
        .ok()
}

pub fn set_step(
    c: &Connection,
    clip_id: i64,
    key: &str,
    status: &str,
    log: Option<&str>,
    exit: Option<i64>,
    started: bool,
    finished: bool,
) -> Result<(), String> {
    c.execute(
        "INSERT OR IGNORE INTO steps (clip_id, step_key) VALUES (?1, ?2)",
        params![clip_id, key],
    )
    .map_err(|e| e.to_string())?;
    c.execute(
        "UPDATE steps SET status = ?3,
           log = COALESCE(?4, log),
           exit_code = CASE WHEN ?5 IS NULL THEN exit_code ELSE ?5 END,
           started_at = CASE WHEN ?6 THEN ?8 ELSE started_at END,
           finished_at = CASE WHEN ?7 THEN ?8 WHEN ?6 THEN NULL ELSE finished_at END
         WHERE clip_id = ?1 AND step_key = ?2",
        params![clip_id, key, status, log, exit, started, finished, now()],
    )
    .map_err(|e| e.to_string())?;
    c.execute(
        "UPDATE clips SET updated_at = ?2 WHERE id = ?1",
        params![clip_id, now()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------- agents ----------
const AGENT_COLS: &str = "id, name, title, description, provider, model, effort, instructions, command, api_base, is_default";

fn agent_from_row(r: &Row) -> rusqlite::Result<crate::models::Agent> {
    let provider: String = r.get(4)?;
    let id: i64 = r.get(0)?;
    let has_key = crate::ai::is_api(&provider) && crate::ai::get_key(id).is_some();
    Ok(crate::models::Agent {
        id,
        name: r.get(1)?,
        title: r.get(2)?,
        description: r.get(3)?,
        provider,
        model: r.get(5)?,
        effort: r.get(6)?,
        instructions: r.get(7)?,
        command: r.get(8)?,
        api_base: r.get(9)?,
        is_default: r.get::<_, i64>(10)? != 0,
        has_key,
    })
}

pub fn list_agents(c: &Connection) -> Result<Vec<crate::models::Agent>, String> {
    let mut st = c
        .prepare(&format!("SELECT {AGENT_COLS} FROM agents ORDER BY is_default DESC, id"))
        .map_err(|e| e.to_string())?;
    let rows = st.query_map([], agent_from_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn get_agent(c: &Connection, id: i64) -> Option<crate::models::Agent> {
    c.query_row(&format!("SELECT {AGENT_COLS} FROM agents WHERE id = ?1"), params![id], agent_from_row).ok()
}

pub fn default_agent(c: &Connection) -> Option<crate::models::Agent> {
    c.query_row(&format!("SELECT {AGENT_COLS} FROM agents ORDER BY is_default DESC, id LIMIT 1"), [], agent_from_row)
        .ok()
}

/// The agent a project's flow or a step uses: the given id, else the default.
pub fn pick_agent(c: &Connection, id: &str) -> Option<crate::models::Agent> {
    id.trim().parse::<i64>().ok().and_then(|i| get_agent(c, i)).or_else(|| default_agent(c))
}

/// First start: one default agent made from the single AI setting of the first version (if any).
fn seed_agents(c: &Connection) {
    let n: i64 = c.query_row("SELECT COUNT(*) FROM agents", [], |r| r.get(0)).unwrap_or(1);
    if n > 0 {
        return;
    }
    let st = |k: &str| get_setting(c, k).filter(|v| !v.trim().is_empty());
    let api = st("ai_provider").as_deref() == Some("api");
    let legacy_cli = st("ai_cli_cmd").filter(|v| v.trim() != "claude -p");
    let (provider, command) = if api {
        ("anthropic-api", String::new())
    } else if let Some(cmd) = legacy_cli {
        ("custom", cmd)
    } else {
        ("claude", String::new())
    };
    let model = if api { st("ai_api_model").unwrap_or_default() } else { String::new() };
    let base = if api { st("ai_api_base").unwrap_or_default() } else { String::new() };
    let ok = c
        .execute(
            "INSERT INTO agents (name, title, description, provider, model, command, api_base, is_default) VALUES ('Editor', 'ผู้คุมงานทั้ง flow', 'เขียนบท ออกแบบภาพ และคุมลำดับขั้นตอนทั้งหมด', ?1, ?2, ?3, ?4, 1)",
            params![provider, model, command, base],
        )
        .is_ok();
    if ok && api {
        if let Some(k) = crate::ai::legacy_key() {
            let _ = crate::ai::set_key(c.last_insert_rowid(), &k);
        }
    }
}
