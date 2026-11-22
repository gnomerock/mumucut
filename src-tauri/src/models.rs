use serde::{Deserialize, Serialize};
use serde_json::Value;

/// A channel / series: where its files live and which steps its flow has.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub workdir: String,
    pub library_dir: String,
    pub key_prefix: String,
    pub config: Value,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(default)]
pub struct StepDef {
    pub key: String,
    pub label: String,
    pub desc: String,
    /// pick | ai | shell | check | deliver | manual | post
    pub kind: String,
    /// shell: the command (one command per line). ai: optional command run after the AI answer is saved.
    pub cmd: String,
    /// ai: prompt template
    pub prompt: String,
    /// ai: write the answer to this file (relative to workdir)
    pub output_file: String,
    /// ai: merge the answer's top-level keys into this JSON file instead
    pub merge_into: String,
    /// after a successful run the step waits for the user's approval (status "review")
    pub gate: bool,
    /// only one GPU step may run at a time
    pub gpu: bool,
    /// image shown in the step card (relative to workdir)
    pub preview: String,
}

impl Default for StepDef {
    fn default() -> Self {
        StepDef {
            key: String::new(),
            label: String::new(),
            desc: String::new(),
            kind: "manual".into(),
            cmd: String::new(),
            prompt: String::new(),
            output_file: String::new(),
            merge_into: String::new(),
            gate: false,
            gpu: false,
            preview: String::new(),
        }
    }
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(default)]
pub struct Pool {
    pub csv: String,
    pub ref_col: i64,
    pub title_col: i64,
    pub brief_cols: Vec<usize>,
    pub used_col: i64,
    pub rating_col: i64,
    pub skip_rating: String,
    pub ref_prefix: String,
}

impl Default for Pool {
    fn default() -> Self {
        Pool {
            csv: String::new(),
            ref_col: 0,
            title_col: 1,
            brief_cols: vec![],
            used_col: -1,
            rating_col: -1,
            skip_rating: String::new(),
            ref_prefix: String::new(),
        }
    }
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(default)]
pub struct Config {
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub max_seconds: f64,
    pub lufs_min: f64,
    pub lufs_max: f64,
    pub peak_max: f64,
    pub video_file: String,
    pub cover_file: String,
    pub extra_files: Vec<String>,
    pub pool: Pool,
    pub steps: Vec<StepDef>,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            width: 1080,
            height: 1920,
            fps: 30.0,
            max_seconds: 30.0,
            lufs_min: -16.5,
            lufs_max: -13.0,
            peak_max: -1.0,
            video_file: "out/{key}.mp4".into(),
            cover_file: "out/covers/{key}_cover.jpg".into(),
            extra_files: vec![],
            pool: Pool::default(),
            steps: vec![],
        }
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct Clip {
    pub id: i64,
    pub project_id: i64,
    pub clip_key: String,
    pub title: String,
    #[serde(rename = "ref")]
    pub ref_: String,
    pub status: String,
    pub brief: String,
    pub script: String,
    pub caption: String,
    pub video_path: Option<String>,
    pub cover_path: Option<String>,
    pub duration: Option<f64>,
    pub lufs: Option<f64>,
    pub notes: String,
    pub created_at: String,
    pub updated_at: String,
    pub done_steps: i64,
}

#[derive(Deserialize, Default, Debug)]
#[serde(default)]
pub struct ClipPatch {
    pub title: Option<String>,
    #[serde(rename = "ref")]
    pub ref_: Option<String>,
    pub status: Option<String>,
    pub brief: Option<String>,
    pub script: Option<String>,
    pub caption: Option<String>,
    pub notes: Option<String>,
    pub video_path: Option<String>,
    pub cover_path: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct StepRow {
    pub clip_id: i64,
    pub step_key: String,
    pub status: String,
    pub log: String,
    pub exit_code: Option<i64>,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct Post {
    pub id: i64,
    pub clip_id: i64,
    pub clip_key: String,
    pub clip_title: String,
    pub platform: String,
    pub scheduled_at: String,
    pub url: String,
    pub status: String,
    pub note: String,
    pub created_at: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct ClipDetail {
    pub clip: Clip,
    pub steps: Vec<StepRow>,
    pub posts: Vec<Post>,
}

#[derive(Serialize, Clone, Debug)]
pub struct LogEvent {
    pub clip_id: i64,
    pub step: String,
    pub stream: String,
    pub line: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct StatusEvent {
    pub clip_id: i64,
    pub step: String,
    pub status: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct CheckItem {
    pub name: String,
    pub ok: bool,
    pub value: String,
    pub expect: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct CheckReport {
    pub ok: bool,
    pub items: Vec<CheckItem>,
    pub duration: f64,
    pub lufs: Option<f64>,
    pub peak: Option<f64>,
}

#[derive(Serialize, Clone, Debug)]
pub struct ToolStatus {
    pub key: String,
    pub name: String,
    pub ok: bool,
    pub detail: String,
}
