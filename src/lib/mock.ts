/* In-memory stand-in for the Rust backend. Used only when the UI is opened in a plain browser
   (npm run dev) so the interface can be previewed; the packaged app always uses the real commands. */
import { dhammaConfig } from "./templates";
import type { Clip, Post, Project, Settings, StepRow } from "./types";

const now = () => new Date().toISOString().slice(0, 19).replace("T", " ");
let projects: Project[] = [
  { id: 1, name: "ธรรมะผู้สูงอายุ", workdir: "D:\\short-clips\\dhamma-elders\\video", library_dir: "D:\\short-clips\\library\\dhamma", key_prefix: "EP", config: dhammaConfig("") },
];
const mk = (id: number, key: string, title: string, ref: string, status: Clip["status"], done: number, dur: number | null): Clip => ({
  id, project_id: 1, clip_key: key, title, ref, status, brief: "", script: "", caption: "ใจเรากวัดแกว่งง่ายไหมครับ? 🎋\nธรรมบทเปรียบไว้ว่า ใจดิ้นรนกวัดแกว่ง รักษายาก ผู้มีปัญญาย่อมดัดใจให้ตรง\n\nที่มา: " + ref + "\n#ธรรมะ #ธรรมบท", video_path: null, cover_path: null, duration: dur, lufs: dur ? -14.8 : null, notes: "", created_at: now(), updated_at: now(), done_steps: done,
});
let clips: Clip[] = [
  mk(8, "EP18", "กลิ่นของความดี", "ธรรมบท คาถาที่ ๕๔", "ready", 10, 23.1),
  mk(7, "EP17", "ดูตัวเองก่อนดูคนอื่น", "ธรรมบท คาถาที่ ๕๐", "ready", 10, 26.5),
  mk(6, "EP16", "ดัดใจให้ตรง", "ธรรมบท คาถาที่ ๓๓", "ready", 10, 27.0),
  mk(5, "EP15", "สร้างเกาะให้ตัวเอง", "ธรรมบท คาถาที่ ๒๕", "scheduled", 10, 26.0),
  mk(4, "EP14", "ใจมั่นคงเหมือนหินผา", "ธรรมบท คาถาที่ ๘๑", "scheduled", 10, 28.9),
  mk(3, "EP13", "หัวใจของคำสอน", "ธรรมบท คาถาที่ ๑๘๓", "posted", 11, 24.0),
  mk(9, "EP19", "ใจที่ฝึกแล้วนำสุขมาให้", "ธรรมบท คาถาที่ ๓๕", "making", 4, null),
  mk(10, "EP20", "", "", "draft", 0, null),
];
const stepsFor = (id: number): StepRow[] => {
  const c = clips.find((x) => x.id === id)!;
  const keys = projects[0].config.steps.map((s) => s.key);
  return keys.map((k, i): StepRow => ({
    clip_id: id, step_key: k,
    status: i < c.done_steps ? "done" : i === c.done_steps && c.status === "making" ? "review" : "pending",
    log: i < c.done_steps ? "✓ เสร็จ" : "", exit_code: null, started_at: null, finished_at: null,
  }));
};
const posts: Post[] = [
  { id: 1, clip_id: 4, clip_key: "EP14", clip_title: "ใจมั่นคงเหมือนหินผา", platform: "facebook", scheduled_at: "2026-11-22 17:00", url: "https://www.facebook.com/reel/2393251817879275", status: "scheduled", note: "", created_at: now() },
  { id: 2, clip_id: 4, clip_key: "EP14", clip_title: "ใจมั่นคงเหมือนหินผา", platform: "youtube", scheduled_at: "2026-11-22 17:00", url: "https://youtu.be/qW6SZwoTRL0", status: "scheduled", note: "", created_at: now() },
];
let settings: Settings = { ai_provider: "cli", ai_cli_cmd: "claude -p", theme: "system" };

export async function mockInvoke<T>(cmd: string, a: Record<string, unknown> = {}): Promise<T> {
  await new Promise((r) => setTimeout(r, 40));
  const out = (v: unknown) => v as T;
  switch (cmd) {
    case "get_settings": return out(settings);
    case "set_setting": settings = { ...settings, [a.key as string]: a.value as string }; return out(null);
    case "has_api_key": return out(false);
    case "set_api_key": case "clear_api_key": return out(null);
    case "check_tools":
      return out([
        { key: "ffmpeg", name: "ffmpeg", ok: true, detail: "ffmpeg version 9.0-full_build" },
        { key: "ffprobe", name: "ffprobe", ok: true, detail: "ffprobe version 9.0-full_build" },
        { key: "node", name: "Node.js", ok: true, detail: "v24.13.0" },
        { key: "python", name: "Python", ok: true, detail: "Python 3.14.5" },
        { key: "ai_cli", name: "AI CLI (claude)", ok: true, detail: "C:\\Users\\…\\claude.exe" },
        { key: "ai_key", name: "AI API key", ok: false, detail: "ยังไม่ได้ตั้ง" },
        { key: "comfy", name: "ComfyUI", ok: false, detail: "พอร์ต 8188 ยังไม่เปิด (ขั้นตอนสร้างภาพจะเปิดเอง)" },
        { key: "voice", name: "VoiceStudio", ok: true, detail: "พอร์ต 3900 เปิดอยู่" },
      ]);
    case "list_projects": return out(projects);
    case "save_project": { const p = a.project as Project; const i = projects.findIndex((x) => x.id === p.id); if (i >= 0) projects[i] = p; else projects.push({ ...p, id: projects.length + 1 }); return out(p); }
    case "delete_project": projects = projects.filter((p) => p.id !== a.id); return out(null);
    case "list_clips": return out(clips.filter((c) => !a.projectId || c.project_id === a.projectId));
    case "get_clip_detail": { const c = clips.find((x) => x.id === a.id)!; return out({ clip: c, steps: stepsFor(c.id), posts: posts.filter((p) => p.clip_id === c.id) }); }
    case "create_clip": { const id = clips.length + 20; const c = mk(id, "EP" + (id), "", "", "draft", 0, null); clips = [c, ...clips]; return out(c); }
    case "update_clip": { const c = clips.find((x) => x.id === a.id)!; Object.assign(c, a.patch as object); return out(c); }
    case "delete_clip": clips = clips.filter((c) => c.id !== a.id); return out(null);
    case "import_library": return out(0);
    case "run_step": case "set_step_status": return out({ clip_id: a.clipId, step_key: a.stepKey, status: "done", log: "", exit_code: 0, started_at: null, finished_at: null });
    case "cancel_step": return out(false);
    case "running_steps": return out([]);
    case "list_posts": return out(posts.filter((p) => !a.clipId || p.clip_id === a.clipId));
    case "add_post": return out(posts);
    case "update_post": case "delete_post": case "reset_steps": return out(null);
    case "get_stats": {
      const by: Record<string, number> = {};
      clips.forEach((c) => (by[c.status] = (by[c.status] ?? 0) + 1));
      return out({ by_status: by, scheduled_posts: posts.length, projects: projects.length });
    }
    case "read_text_file": return out("{\n  \"id\": \"EP16\",\n  \"lines\": []\n}");
    case "write_text_file": return out(null);
    case "path_exists": return out(false);
    case "resolve_project_path": return out(`${a.workdir}\\${String(a.rel).replace("{key}", String(a.key))}`);
    default: throw new Error("mock: ไม่รองรับ " + cmd);
  }
}
