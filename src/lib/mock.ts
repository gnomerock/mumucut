/* In-memory stand-in for the Rust backend. Used only when the UI is opened in a plain browser
   (npm run dev) so the interface can be previewed; the packaged app always uses the real commands. */
import { dhammaConfig } from "./templates";
import type { AffiliateLink, Agent, Asset, Clip, Post, Project, Settings, SocialAccount, StepRow } from "./types";

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
let agents: Agent[] = [
  { id: 1, name: "Editor", title: "ผู้คุมงานทั้ง flow", description: "เขียนบท ออกแบบภาพ และคุมลำดับขั้นตอนทั้งหมด", provider: "claude", model: "", effort: "", instructions: "", command: "", api_base: "", is_default: true, has_key: false },
  { id: 2, name: "Writer", title: "เขียนคำบรรยาย", description: "", provider: "anthropic-api", model: "claude-sonnet-5-5", effort: "", instructions: "ตอบเป็นภาษาไทย", command: "", api_base: "", is_default: false, has_key: true },
];
let settings: Settings = { ai_provider: "cli", ai_cli_cmd: "claude -p", theme: "system", voice_cmd: "python vs_gen.py --text {prompt} --out \"{out}\"" };
// ?fresh in the URL previews the first-run screen
if (typeof location !== "undefined" && location.search.includes("fresh")) {
  projects = [];
  clips = [];
}
let assets: Asset[] = [
  { id: 1, channel_id: 1, clip_id: null, kind: "image", name: "lotus_paper.png", path: "D:\\short-clips\\dhamma-elders\\02_assets\\library\\lotus_paper.png", tags: "ดอกบัว, กระดาษพับ", note: "", source: "file", created_at: now(), exists: true },
  { id: 2, channel_id: 1, clip_id: null, kind: "image", name: "candle_paper.png", path: "D:\\short-clips\\dhamma-elders\\02_assets\\library\\candle_paper.png", tags: "เทียน", note: "", source: "file", created_at: now(), exists: true },
  { id: 3, channel_id: null, clip_id: null, kind: "audio", name: "outro_chime.wav", path: "D:\\short-clips\\outro\\chime.wav", tags: "เสียงปิด", note: "", source: "file", created_at: now(), exists: true },
  { id: 4, channel_id: 1, clip_id: 9, kind: "image", name: "ai_image_20261123.png", path: "D:\\short-clips\\dhamma-elders\\video\\assets\\EP19\\ai_image_20261123.png", tags: "", note: "ชายสูงอายุนั่งสมาธิใต้ต้นไม้ กระดาษพับ", source: "ai", created_at: now(), exists: true },
];
let links: AffiliateLink[] = [
  { id: 1, channel_id: null, platform: "shopee", title: "หนังสือธรรมะเล่มเล็ก", url: "https://s.shopee.co.th/example", note: "ใส่เฉพาะ Facebook", tags: "", created_at: now(), used: 1 },
  { id: 2, channel_id: null, platform: "amazon", title: "Meditation cushion", url: "https://amzn.to/example", note: "", tags: "", created_at: now(), used: 0 },
];
let clipLinks: { clip_id: number; link_id: number; placement: string }[] = [{ clip_id: 9, link_id: 1, placement: "facebook" }];
let accounts: SocialAccount[] = [
  { id: 1, channel_id: 1, platform: "facebook", name: "ธรรมะผู้สูงอายุ", handle: "", url: "https://facebook.com/", created_at: now(), has_token: false },
  { id: 2, channel_id: 1, platform: "youtube", name: "ธรรมะผู้สูงอายุ", handle: "@dhamma", url: "", created_at: now(), has_token: false },
];
let nextId = 100;

export async function mockInvoke<T>(cmd: string, a: Record<string, unknown> = {}): Promise<T> {
  const a_ = a as Record<string, unknown> & { agent?: Agent; id?: number };
  await new Promise((r) => setTimeout(r, 40));
  const out = (v: unknown) => v as T;
  switch (cmd) {
    case "get_settings": return out(settings);
    case "set_setting": settings = { ...settings, [a.key as string]: a.value as string }; return out(null);
    case "list_agents": return out(agents);
    case "save_agent": { return out(a_.agent); }
    case "delete_agent": agents = agents.filter((x) => x.id !== a_.id); return out(null);
    case "set_default_agent": agents = agents.map((x) => ({ ...x, is_default: x.id === a_.id })); return out(null);
    case "set_agent_key": case "clear_agent_key": return out(null);
    case "test_agent": return out({ ok: true, answer: "OK", ms: 1800 });
    case "run_flow": return out("agent จบการทำงาน");
    case "check_tools":
      return out([
        { key: "ffmpeg", name: "ffmpeg", ok: true, detail: "ffmpeg version 9.0-full_build" },
        { key: "ffprobe", name: "ffprobe", ok: true, detail: "ffprobe version 9.0-full_build" },
        { key: "node", name: "Node.js", ok: true, detail: "v24.13.0" },
        { key: "python", name: "Python", ok: true, detail: "Python 3.14.5" },
        { key: "agent_1", name: "AI agent Editor", ok: true, detail: "C:\\Users\\…\\claude.exe" },
        { key: "agent_2", name: "AI agent Writer", ok: true, detail: "มี API key ใน Credential Manager" },
        { key: "comfy", name: "ComfyUI", ok: false, detail: "พอร์ต 8188 ยังไม่เปิด (ขั้นตอนสร้างภาพจะเปิดเอง)" },
        { key: "voice", name: "VoiceStudio", ok: true, detail: "พอร์ต 3900 เปิดอยู่" },
      ]);
    case "list_projects": return out(projects);
    case "save_project": { const p = a.project as Project; const i = projects.findIndex((x) => x.id === p.id); if (i >= 0) { projects[i] = p; return out(p); } const n = { ...p, id: Math.max(0, ...projects.map((x) => x.id)) + 1 }; projects.push(n); return out(n); }
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
    case "ensure_dir": return out(null);
    case "list_assets":
      return out(a.clipId ? assets.filter((x) => x.clip_id === a.clipId) : assets.filter((x) => x.clip_id == null && (!a.channelId || x.channel_id == null || x.channel_id === a.channelId)));
    case "add_assets": return out([]);
    case "update_asset": { const v = a.asset as Asset; assets = assets.map((x) => (x.id === v.id ? v : x)); return out(v); }
    case "delete_asset": assets = assets.filter((x) => x.id !== a.id); return out(null);
    case "use_library_asset": { const src = assets.find((x) => x.id === a.assetId)!; const v = { ...src, id: nextId++, clip_id: a.clipId as number, source: "library" as const }; assets = [v, ...assets]; return out(v); }
    case "share_asset": { const src = assets.find((x) => x.id === a.assetId)!; const v = { ...src, id: nextId++, clip_id: null }; assets = [v, ...assets]; return out(v); }
    case "generate_asset": throw new Error("ยังไม่ได้ตั้งคำสั่งสร้างภาพ ไปที่ ตั้งค่า → เครื่องมือ AI สร้าง assets");
    case "list_affiliates": return out(links.map((l) => ({ ...l, used: clipLinks.filter((x) => x.link_id === l.id).length })));
    case "save_affiliate": { const l = a.link as AffiliateLink; if (l.id) { links = links.map((x) => (x.id === l.id ? l : x)); return out(l); } const v = { ...l, id: nextId++, created_at: now() }; links = [v, ...links]; return out(v); }
    case "delete_affiliate": links = links.filter((x) => x.id !== a.id); clipLinks = clipLinks.filter((x) => x.link_id !== a.id); return out(null);
    case "list_clip_affiliates": return out(clipLinks.filter((x) => x.clip_id === a.clipId).map((x) => ({ link: links.find((l) => l.id === x.link_id)!, placement: x.placement })).filter((x) => x.link));
    case "attach_affiliate": clipLinks = [...clipLinks.filter((x) => !(x.clip_id === a.clipId && x.link_id === a.linkId)), { clip_id: a.clipId as number, link_id: a.linkId as number, placement: a.placement as string }]; return out(null);
    case "detach_affiliate": clipLinks = clipLinks.filter((x) => !(x.clip_id === a.clipId && x.link_id === a.linkId)); return out(null);
    case "list_accounts": return out(accounts.filter((x) => !a.channelId || x.channel_id == null || x.channel_id === a.channelId));
    case "save_account": { const v = a.account as SocialAccount; if (v.id) { accounts = accounts.map((x) => (x.id === v.id ? v : x)); return out(v); } const n = { ...v, id: nextId++, created_at: now() }; accounts = [...accounts, n]; return out(n); }
    case "delete_account": accounts = accounts.filter((x) => x.id !== a.id); return out(null);
    case "set_account_token": accounts = accounts.map((x) => (x.id === a.id ? { ...x, has_token: true } : x)); return out(null);
    case "clear_account_token": accounts = accounts.map((x) => (x.id === a.id ? { ...x, has_token: false } : x)); return out(null);
    case "open_studio": return out("npx remotion studio");
    case "provider_status":
      return out([
        { id: "ffmpeg", ok: true, detail: "C:\\…\\ffmpeg.exe", version: "9.0-full_build" },
        { id: "remotion", ok: true, detail: "ในโฟลเดอร์งานของช่อง", version: "4.0.380" },
        { id: "hyperframes", ok: false, detail: "ยังไม่ได้ติดตั้ง (ใช้ผ่าน npx ได้ แต่ครั้งแรกจะช้า)", version: "" },
        { id: "skills-remotion", ok: true, detail: "remotion-best-practices, remotion-render, …", version: "12 skills" },
        { id: "skills-hyperframes", ok: false, detail: "ยังไม่ได้ติดตั้ง", version: "" },
        { id: "comfyui", ok: !!settings.comfy_image_cmd, detail: "http://127.0.0.1:8188 ยังไม่เปิด", version: "" },
        { id: "comfyui-mcp", ok: settings.comfy_mcp_enabled === "1", detail: settings.comfy_mcp_enabled === "1" ? "agent ใช้ npx -y comfyui-mcp" : "ปิดอยู่", version: "" },
        { id: "openai-image", ok: false, detail: "ยังไม่ได้ใส่ API key", version: "" },
        { id: "custom-image", ok: false, detail: "ยังไม่ได้ตั้งคำสั่ง", version: "" },
        { id: "voicestudio", ok: true, detail: "พอร์ต 3900 เปิดอยู่", version: "" },
        { id: "elevenlabs", ok: false, detail: "ยังไม่ได้ใส่ API key", version: "" },
        { id: "custom-audio", ok: false, detail: "ยังไม่ได้ตั้งคำสั่ง", version: "" },
      ]);
    case "set_provider_key": case "clear_provider_key": return out(null);
    case "run_installer": return out("npx skills add heygen-com/hyperframes");
    case "test_comfy_mcp": return out("เชื่อมได้: comfyui-mcp มีเครื่องมือ 38 อย่าง");
    case "ai_write": return out("(ตัวอย่างคำตอบจาก AI ในโหมดดูตัวอย่าง)");
    default: throw new Error("mock: ไม่รองรับ " + cmd);
  }
}
