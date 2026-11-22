use crate::db;
use rusqlite::Connection;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct RunInfo {
    pub pid: u32,
    pub gpu: bool,
}

pub struct AppState {
    pub db: Mutex<Connection>,
    pub running: Mutex<HashMap<(i64, String), RunInfo>>,
    pub data_dir: PathBuf,
}

impl AppState {
    pub fn setting(&self, key: &str) -> Option<String> {
        let c = self.db.lock().unwrap();
        db::get_setting(&c, key).filter(|v| !v.trim().is_empty())
    }

    /// Folders searched before PATH (Node, ffmpeg) - set in Settings.
    pub fn extra_dirs(&self) -> Vec<PathBuf> {
        let mut v = vec![];
        for k in ["node_dir", "ffmpeg_dir"] {
            if let Some(d) = self.setting(k) {
                v.push(PathBuf::from(d));
            }
        }
        v
    }

    /// PATH value for child processes: extra dirs first.
    pub fn child_path(&self) -> String {
        let mut parts: Vec<PathBuf> = self.extra_dirs();
        if let Some(p) = std::env::var_os("PATH") {
            parts.extend(std::env::split_paths(&p));
        }
        std::env::join_paths(parts)
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default()
    }
}

pub fn hide_window(cmd: &mut tokio::process::Command) {
    #[cfg(windows)]
    {
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    #[cfg(not(windows))]
    {
        let _ = cmd;
    }
}
