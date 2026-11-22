use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Replace `{name}` placeholders.
pub fn subst(s: &str, vars: &HashMap<String, String>) -> String {
    let mut out = s.to_string();
    for (k, v) in vars {
        out = out.replace(&format!("{{{k}}}"), v);
    }
    out
}

/// Resolve a path from the project config (relative to workdir unless absolute).
pub fn resolve(workdir: &str, rel: &str) -> PathBuf {
    let p = Path::new(rel);
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        Path::new(workdir).join(rel)
    }
}

/// Find an executable on PATH (plus extra directories).
pub fn find_exe(name: &str, extra: &[PathBuf]) -> Option<PathBuf> {
    let mut dirs: Vec<PathBuf> = extra.to_vec();
    if let Some(path) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&path));
    }
    let exts: &[&str] = if cfg!(windows) { &["exe", "cmd", "bat", "com"] } else { &[""] };
    for d in dirs {
        for e in exts {
            let f = if e.is_empty() { d.join(name) } else { d.join(format!("{name}.{e}")) };
            if f.is_file() {
                return Some(f);
            }
        }
    }
    None
}

/// Expand one `*` in the file name (not in directories). Returns sorted matches.
pub fn glob_one(pattern: &Path) -> Vec<PathBuf> {
    let name = match pattern.file_name().and_then(|n| n.to_str()) {
        Some(n) => n.to_string(),
        None => return vec![],
    };
    let dir = pattern.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    if !name.contains('*') {
        return if pattern.exists() { vec![pattern.to_path_buf()] } else { vec![] };
    }
    let (pre, suf) = name.split_once('*').unwrap();
    let mut out: Vec<PathBuf> = std::fs::read_dir(&dir)
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| {
                    p.is_file()
                        && p.file_name()
                            .and_then(|n| n.to_str())
                            .map(|n| n.len() >= pre.len() + suf.len() && n.starts_with(pre) && n.ends_with(suf))
                            .unwrap_or(false)
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort();
    out
}

pub fn tail_chars(s: &str, max: usize) -> String {
    let count = s.chars().count();
    if count <= max {
        return s.to_string();
    }
    let skip = count - max;
    format!("…(ตัดส่วนต้น)\n{}", s.chars().skip(skip).collect::<String>())
}

pub fn norm_path(p: &Path) -> String {
    p.to_string_lossy().replace("\\\\?\\", "")
}

pub fn tcp_open(host: &str, port: u16) -> bool {
    use std::net::{SocketAddr, TcpStream};
    use std::time::Duration;
    let addr: SocketAddr = match format!("{host}:{port}").parse() {
        Ok(a) => a,
        Err(_) => return false,
    };
    TcpStream::connect_timeout(&addr, Duration::from_millis(600)).is_ok()
}
