export type ClipStatus = "draft" | "making" | "ready" | "scheduled" | "posted" | "hold" | "blocked";
export type StepStatus = "pending" | "running" | "done" | "review" | "failed" | "skipped";
export type StepKind = "pick" | "ai" | "shell" | "check" | "deliver" | "manual" | "post";

export interface StepDef {
  key: string;
  label: string;
  desc: string;
  kind: StepKind;
  cmd: string;
  prompt: string;
  output_file: string;
  merge_into: string;
  gate: boolean;
  gpu: boolean;
  preview: string;
  agent: string;
}

export interface Pool {
  csv: string;
  ref_col: number;
  title_col: number;
  brief_cols: number[];
  used_col: number;
  rating_col: number;
  skip_rating: string;
  ref_prefix: string;
}

export interface TextStyle {
  font: string;
  stroke: number;
  shadow: number;
  white: string;
  rose: string;
  safe: { left: number; right: number; top: number; bottom: number };
}

export interface ProjectConfig {
  width: number;
  height: number;
  fps: number;
  max_seconds: number;
  lufs_min: number;
  lufs_max: number;
  peak_max: number;
  video_file: string;
  cover_file: string;
  extra_files: string[];
  pool: Pool;
  steps: StepDef[];
  text: TextStyle;
  run_mode: "steps" | "agent";
  flow_agent: string;
  flow_prompt: string;
}

export interface Project {
  id: number;
  name: string;
  workdir: string;
  library_dir: string;
  key_prefix: string;
  config: ProjectConfig;
}

export interface Clip {
  id: number;
  project_id: number;
  clip_key: string;
  title: string;
  ref: string;
  status: ClipStatus;
  brief: string;
  script: string;
  caption: string;
  video_path: string | null;
  cover_path: string | null;
  duration: number | null;
  lufs: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
  done_steps: number;
}

export interface StepRow {
  clip_id: number;
  step_key: string;
  status: StepStatus;
  log: string;
  exit_code: number | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface Post {
  id: number;
  clip_id: number;
  clip_key: string;
  clip_title: string;
  platform: string;
  scheduled_at: string;
  url: string;
  status: string;
  note: string;
  created_at: string;
}

export interface ClipDetail {
  clip: Clip;
  steps: StepRow[];
  posts: Post[];
}

export interface ToolStatus {
  key: string;
  name: string;
  ok: boolean;
  detail: string;
}

export interface Stats {
  by_status: Record<string, number>;
  scheduled_posts: number;
  projects: number;
}

export interface LogEvent {
  clip_id: number;
  step: string;
  stream: string;
  line: string;
}
export interface StatusEvent {
  clip_id: number;
  step: string;
  status: StepStatus;
}

export type Settings = Record<string, string>;

export interface Agent {
  id: number;
  name: string;
  title: string;
  description: string;
  provider: string;
  model: string;
  effort: string;
  instructions: string;
  command: string;
  api_base: string;
  is_default: boolean;
  has_key: boolean;
}

export interface TestResult {
  ok: boolean;
  answer: string;
  ms: number;
}
