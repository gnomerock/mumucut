use crate::models::*;
use crate::state::{hide_window, AppState};
use crate::util::find_exe;
use serde_json::Value;
use std::path::Path;
use std::process::Stdio;
use tokio::process::Command;

fn parse_fraction(s: &str) -> f64 {
    match s.split_once('/') {
        Some((a, b)) => {
            let (a, b) = (a.parse::<f64>().unwrap_or(0.0), b.parse::<f64>().unwrap_or(1.0));
            if b == 0.0 { 0.0 } else { a / b }
        }
        None => s.parse().unwrap_or(0.0),
    }
}

fn last_number(text: &str, label: &str, unit: &str) -> Option<f64> {
    let mut found = None;
    for line in text.lines() {
        let t = line.trim();
        if let Some(rest) = t.strip_prefix(label) {
            let rest = rest.trim();
            if rest.ends_with(unit) {
                if let Ok(v) = rest[..rest.len() - unit.len()].trim().parse::<f64>() {
                    found = Some(v);
                }
            }
        }
    }
    found
}

pub async fn check_video(state: &AppState, path: &Path, cfg: &Config) -> Result<CheckReport, String> {
    if !path.is_file() {
        return Err(format!("ไม่พบไฟล์วิดีโอ: {}", path.display()));
    }
    let extra = state.extra_dirs();
    let ffprobe = find_exe("ffprobe", &extra).ok_or("ไม่พบ ffprobe (ตั้งโฟลเดอร์ ffmpeg ในหน้าตั้งค่า)")?;
    let ffmpeg = find_exe("ffmpeg", &extra).ok_or("ไม่พบ ffmpeg (ตั้งโฟลเดอร์ ffmpeg ในหน้าตั้งค่า)")?;

    let mut c = Command::new(ffprobe);
    c.args(["-v", "error", "-print_format", "json", "-show_streams", "-show_format"])
        .arg(path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_window(&mut c);
    let out = c.output().await.map_err(|e| format!("รัน ffprobe ไม่ได้: {e}"))?;
    let j: Value = serde_json::from_slice(&out.stdout).map_err(|e| format!("อ่านผล ffprobe ไม่ได้: {e}"))?;
    let streams = j["streams"].as_array().cloned().unwrap_or_default();
    let video = streams.iter().find(|s| s["codec_type"] == "video");
    let audio = streams.iter().find(|s| s["codec_type"] == "audio");
    let w = video.and_then(|v| v["width"].as_u64()).unwrap_or(0) as u32;
    let h = video.and_then(|v| v["height"].as_u64()).unwrap_or(0) as u32;
    let fps = video
        .and_then(|v| v["r_frame_rate"].as_str())
        .map(parse_fraction)
        .unwrap_or(0.0);
    let dur: f64 = j["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0.0);

    // loudness (EBU R128) + true peak
    let mut c = Command::new(ffmpeg);
    c.args(["-hide_banner", "-nostats", "-i"])
        .arg(path)
        .args(["-af", "ebur128=peak=true", "-f", "null", "-"])
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    hide_window(&mut c);
    let o = c.output().await.map_err(|e| format!("รัน ffmpeg ไม่ได้: {e}"))?;
    let text = String::from_utf8_lossy(&o.stderr).to_string();
    let lufs = if audio.is_some() { last_number(&text, "I:", "LUFS") } else { None };
    let peak = if audio.is_some() { last_number(&text, "Peak:", "dBFS") } else { None };

    let mut items = vec![];
    items.push(CheckItem {
        name: "ขนาดภาพ".into(),
        ok: w == cfg.width && h == cfg.height,
        value: format!("{w}x{h}"),
        expect: format!("{}x{}", cfg.width, cfg.height),
    });
    items.push(CheckItem {
        name: "เฟรมเรต".into(),
        ok: (fps - cfg.fps).abs() < 0.05,
        value: format!("{fps:.2} fps"),
        expect: format!("{} fps", cfg.fps),
    });
    items.push(CheckItem {
        name: "ความยาว".into(),
        ok: dur > 0.0 && dur <= cfg.max_seconds,
        value: format!("{dur:.1} วิ"),
        expect: format!("≤ {} วิ", cfg.max_seconds),
    });
    items.push(CheckItem {
        name: "มีเสียง".into(),
        ok: audio.is_some(),
        value: if audio.is_some() { "มี" } else { "ไม่มี" }.into(),
        expect: "มี".into(),
    });
    items.push(CheckItem {
        name: "ความดัง (LUFS)".into(),
        ok: lufs.map(|v| v >= cfg.lufs_min && v <= cfg.lufs_max).unwrap_or(false),
        value: lufs.map(|v| format!("{v:.1}")).unwrap_or("-".into()),
        expect: format!("{} ถึง {}", cfg.lufs_min, cfg.lufs_max),
    });
    items.push(CheckItem {
        name: "พีคสูงสุด (dBFS)".into(),
        ok: peak.map(|v| v <= cfg.peak_max).unwrap_or(false),
        value: peak.map(|v| format!("{v:.1}")).unwrap_or("-".into()),
        expect: format!("≤ {}", cfg.peak_max),
    });
    let ok = items.iter().all(|i| i.ok);
    Ok(CheckReport { ok, items, duration: dur, lufs, peak })
}
