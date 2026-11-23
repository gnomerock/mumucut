import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ChevronRight, CirclePlus, Download, FlaskConical, KeyRound, RefreshCw, Search, Settings2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { api } from "@/lib/api";
import type { Agent, ProviderStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AgentEditDialog, blankAgent } from "@/components/AgentsCard";
import { cn } from "@/lib/utils";

type Cat = "language" | "image" | "video" | "audio";
type Kind = "agent" | "config" | "tool" | "mcp";

interface Def {
  id: string;
  name: string;
  sub: string;
  cats: Cat[];
  kind: Kind;
  icon: { bg: string; t: string; fg?: string };
  badge?: string;
  /** agent providers: provider id + how to tell this preset apart */
  agent?: { provider: string; base?: string; match?: (a: Agent) => boolean };
  /** tool rows: installer id */
  installer?: string;
  /** what the provider can make (for the default models) */
  makes?: ("image" | "speech" | "sfx")[];
}

const isBase = (a: Agent, part: string) => (a.api_base || "").toLowerCase().includes(part);

const DEFS: Def[] = [
  // language = AI agents
  { id: "claude", name: "Claude Code", sub: "บัญชี Claude ที่ล็อกอินในเครื่อง · คุมทั้ง flow ได้", cats: ["language"], kind: "agent", badge: "แนะนำ", icon: { bg: "#D97757", t: "C" }, agent: { provider: "claude" } },
  { id: "codex", name: "Codex CLI", sub: "บัญชี ChatGPT ที่ล็อกอินในเครื่อง", cats: ["language"], kind: "agent", icon: { bg: "#111", t: "Cx" }, agent: { provider: "codex" } },
  { id: "anthropic-api", name: "Anthropic API", sub: "API key", cats: ["language"], kind: "agent", icon: { bg: "#C96442", t: "A" }, agent: { provider: "anthropic-api" } },
  { id: "openai", name: "OpenAI API", sub: "API key", cats: ["language"], kind: "agent", icon: { bg: "#0F0F0F", t: "AI" }, agent: { provider: "openai-api", base: "", match: (a) => a.provider === "openai-api" && (!a.api_base || isBase(a, "api.openai.com")) } },
  { id: "openrouter", name: "OpenRouter", sub: "API key · หลายโมเดลในคีย์เดียว", cats: ["language"], kind: "agent", icon: { bg: "#6566F1", t: "OR" }, agent: { provider: "openai-api", base: "https://openrouter.ai/api/v1", match: (a) => a.provider === "openai-api" && isBase(a, "openrouter") } },
  { id: "ollama", name: "Ollama", sub: "รันโมเดลในเครื่อง ไม่ต้องใช้คีย์", cats: ["language"], kind: "agent", icon: { bg: "#F5F5F4", t: "O", fg: "#111" }, agent: { provider: "openai-api", base: "http://localhost:11434/v1", match: (a) => a.provider === "openai-api" && isBase(a, ":11434") } },
  { id: "lmstudio", name: "LM Studio", sub: "รันโมเดลในเครื่อง ไม่ต้องใช้คีย์", cats: ["language"], kind: "agent", icon: { bg: "#4F46E5", t: "LM" }, agent: { provider: "openai-api", base: "http://localhost:1234/v1", match: (a) => a.provider === "openai-api" && isBase(a, ":1234") } },
  { id: "custom-cli", name: "CLI อื่น", sub: "โปรแกรมใดก็ได้ที่รับ prompt ทาง stdin", cats: ["language"], kind: "agent", icon: { bg: "#52525B", t: ">_" }, agent: { provider: "custom" } },
  // image
  { id: "comfyui", name: "ComfyUI", sub: "ในเครื่อง · คำสั่งสร้างภาพของคุณ", cats: ["image"], kind: "config", badge: "ในเครื่อง", icon: { bg: "#1F2937", t: "Cf" }, makes: ["image"] },
  { id: "comfyui-mcp", name: "ComfyUI MCP", sub: "ให้ AI agent สั่ง ComfyUI ได้เองระหว่างคุม flow", cats: ["image"], kind: "mcp", icon: { bg: "#334155", t: "MCP" } },
  { id: "openai-image", name: "OpenAI Images", sub: "API key · gpt-image-1", cats: ["image"], kind: "config", icon: { bg: "#0F0F0F", t: "AI" }, makes: ["image"] },
  { id: "custom-image", name: "คำสั่งสร้างภาพเอง", sub: "สคริปต์ PowerShell ของคุณ", cats: ["image"], kind: "config", icon: { bg: "#52525B", t: ">_" }, makes: ["image"] },
  // video
  { id: "remotion", name: "Remotion", sub: "เรนเดอร์คลิปด้วย React · ติดตั้งในโฟลเดอร์งานของช่อง", cats: ["video"], kind: "tool", installer: "remotion", icon: { bg: "#0B84F3", t: "R" } },
  { id: "hyperframes", name: "HyperFrames", sub: "เรนเดอร์คลิปจาก HTML", cats: ["video"], kind: "tool", installer: "hyperframes", icon: { bg: "#7C3AED", t: "HF" } },
  { id: "ffmpeg", name: "FFmpeg", sub: "ตรวจไฟล์ ความดัง และแปลงวิดีโอ", cats: ["video"], kind: "tool", installer: "ffmpeg", icon: { bg: "#16A34A", t: "ff" } },
  { id: "skills-remotion", name: "Remotion skills", sub: "ความรู้ Remotion สำหรับ AI agent (remotion-dev/skills)", cats: ["video"], kind: "tool", installer: "skills-remotion", icon: { bg: "#0B84F3", t: "SK" } },
  { id: "skills-hyperframes", name: "HyperFrames skills", sub: "ความรู้ HyperFrames สำหรับ AI agent (heygen-com/hyperframes)", cats: ["video"], kind: "tool", installer: "skills-hyperframes", icon: { bg: "#7C3AED", t: "SK" } },
  // audio
  { id: "voicestudio", name: "VoiceStudio", sub: "ในเครื่อง · โคลนเสียงและอ่านบท", cats: ["audio"], kind: "config", badge: "ในเครื่อง", icon: { bg: "#0EA5E9", t: "VS" }, makes: ["speech"] },
  { id: "elevenlabs", name: "ElevenLabs", sub: "API key · เสียงพูดและเสียงประกอบ", cats: ["audio"], kind: "config", icon: { bg: "#111", t: "II" }, makes: ["speech", "sfx"] },
  { id: "custom-audio", name: "คำสั่งทำเสียงเอง", sub: "สคริปต์ PowerShell ของคุณ", cats: ["audio"], kind: "config", icon: { bg: "#52525B", t: ">_" }, makes: ["speech"] },
];

const catLabel: Record<Cat, string> = { language: "ภาษา", image: "ภาพ", video: "วิดีโอ", audio: "เสียง" };
const tabs: ("all" | Cat)[] = ["all", "language", "image", "video", "audio"];
const tabLabel = (t: "all" | Cat) => (t === "all" ? "ทั้งหมด" : t === "language" ? "Language" : t === "image" ? "Image" : t === "video" ? "Video" : "Audio");

export function ProviderIcon({ d }: { d: Def }) {
  return (
    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg text-[12px] font-bold" style={{ background: d.icon.bg, color: d.icon.fg ?? "#fff" }}>
      {d.icon.t}
    </span>
  );
}

export default function ProvidersPanel({ onOpenAgents }: { onOpenAgents: () => void }) {
  const { agents, refreshAgents, project, settings, setSetting, err, notify } = useApp();
  const [cat, setCat] = useState<"all" | Cat>("all");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Record<string, ProviderStatus>>({});
  const [checking, setChecking] = useState(false);
  const [cfg, setCfg] = useState<Def | null>(null);
  const [agentEdit, setAgentEdit] = useState<Agent | null>(null);

  const load = useCallback(async () => {
    setChecking(true);
    try {
      const s = await api.providerStatus(project?.id ?? null);
      setStatus(Object.fromEntries(s.map((x) => [x.id, x])));
    } catch (e) {
      err(e);
    } finally {
      setChecking(false);
    }
  }, [project?.id, err]);
  useEffect(() => {
    void load();
  }, [load]);

  const agentsOf = (d: Def) => agents.filter((a) => (d.agent?.match ? d.agent.match(a) : a.provider === d.agent?.provider));
  const connected = (d: Def) => (d.kind === "agent" ? agentsOf(d).length > 0 : !!status[d.id]?.ok);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return DEFS.filter((d) => (cat === "all" || d.cats.includes(cat)) && (!s || `${d.name} ${d.sub}`.toLowerCase().includes(s)));
  }, [cat, q]);

  function connect(d: Def) {
    if (d.kind === "agent") {
      setAgentEdit({ ...blankAgent(), name: d.name.replace(" API", ""), provider: d.agent!.provider, api_base: d.agent!.base ?? "" });
    } else if (d.kind === "tool") {
      api
        .runInstaller(d.installer!, project?.id ?? null)
        .then((c) => notify(`เปิดหน้าต่างติดตั้งแล้ว: ${c}\nติดตั้งเสร็จแล้วกด ตรวจใหม่`, "info"))
        .catch(err);
    } else {
      setCfg(d);
    }
  }

  // default model rows
  const makers = (m: "image" | "speech" | "sfx") => DEFS.filter((d) => d.makes?.includes(m) && connected(d));
  const defaultAgent = agents.find((a) => a.is_default);
  const showRow = (c: Cat) => cat === "all" || cat === c;

  return (
    <div className="grid max-w-[920px] gap-5">
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาผู้ให้บริการ" className="pl-9" aria-label="ค้นหาผู้ให้บริการ" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={load} disabled={checking}>
            <RefreshCw className={cn(checking && "animate-spin")} /> ตรวจใหม่
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="glass">
                <CirclePlus /> เพิ่มผู้ให้บริการ
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onSelect={() => setAgentEdit({ ...blankAgent(), provider: "openai-api" })}>LLM แบบ OpenAI compatible</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAgentEdit({ ...blankAgent(), provider: "custom" })}>LLM แบบ CLI (ตั้งคำสั่งเอง)</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setCfg(DEFS.find((d) => d.id === "custom-image")!)}>คำสั่งสร้างภาพเอง</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setCfg(DEFS.find((d) => d.id === "custom-audio")!)}>คำสั่งทำเสียงเอง</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex gap-1" role="tablist" aria-label="หมวดผู้ให้บริการ">
        {tabs.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={cat === t}
            onClick={() => setCat(t)}
            className={cn("soft h-8 rounded-full px-4 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", cat === t ? "bg-[var(--glass-bg-strong)] text-foreground ring-1 ring-[var(--glass-hairline)]" : "text-muted-foreground hover:text-foreground")}
          >
            {tabLabel(t)}
          </button>
        ))}
      </div>

      <section className="grid gap-2">
        <div>
          <h3 className="text-[15px] font-semibold">โมเดลหลัก</h3>
          <p className="text-[13px] text-muted-foreground">ที่ MumuCut และ AI agent ใช้สร้างข้อความ ภาพ วิดีโอ และเสียง ถ้าไม่ได้เลือกตัวอื่นเฉพาะงาน</p>
        </div>
        <div className="glass divide-y divide-[var(--glass-hairline)] overflow-hidden rounded-xl">
          {showRow("language") && (
            <button onClick={onOpenAgents} className="soft flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-[var(--glass-bg-subtle)]">
              <span className="flex-1">
                <span className="block text-sm font-semibold">Chat model</span>
                <span className="block text-xs text-muted-foreground">เลือกใน AI agents · ตอนนี้ใช้ {defaultAgent ? `${defaultAgent.name}${defaultAgent.model ? ` (${defaultAgent.model})` : ""}` : "ยังไม่มี"}</span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          )}
          {showRow("image") && <DefaultRow label="Image" k="default_image" options={makers("image")} />}
          {showRow("video") && (
            <DefaultRow
              label="Video"
              k="default_video"
              hint="ใช้เป็นค่าเริ่มต้นตอนสร้างช่องใหม่"
              options={DEFS.filter((d) => (d.id === "remotion" || d.id === "hyperframes") && connected(d))}
            />
          )}
          {showRow("audio") && (
            <>
              {cat === "all" && <div className="px-5 pb-0.5 pt-2.5 text-xs text-muted-foreground">Audio</div>}
              <DefaultRow label="Speech" k="default_speech" options={makers("speech")} />
              <DefaultRow label="Sound effects" k="default_sfx" options={makers("sfx")} />
              <DefaultRow label="Music" k="default_music" options={[]} />
            </>
          )}
        </div>
      </section>

      <section className="grid gap-2">
        <h3 className="text-[15px] font-semibold">
          ผู้ให้บริการ <span className="font-normal text-muted-foreground">{list.length}</span>
        </h3>
        <div className="glass divide-y divide-[var(--glass-hairline)] overflow-hidden rounded-xl">
          {list.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted-foreground">ไม่พบผู้ให้บริการ</p>}
          {list.map((d, i) => {
            const ok = connected(d);
            const s = status[d.id];
            const ags = d.kind === "agent" ? agentsOf(d) : [];
            return (
              <motion.div key={d.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.02 }} className="flex items-center gap-3.5 px-5 py-3">
                <ProviderIcon d={d} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{d.name}</span>
                    {d.badge && <Badge>{d.badge}</Badge>}
                    {d.kind === "tool" && s?.version && <Badge tone="success">{s.version}</Badge>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="truncate">{d.kind === "agent" && ok ? `agent: ${ags.map((a) => a.name).join(", ")}` : d.kind === "tool" || d.kind === "mcp" ? s?.detail ?? d.sub : d.sub}</span>
                    {d.cats.map((c) => (
                      <span key={c} className="rounded bg-[color-mix(in_oklab,var(--foreground)_8%,transparent)] px-1.5 py-px text-[11px]">
                        {catLabel[c]}
                      </span>
                    ))}
                    {d.makes?.includes("sfx") && <span className="rounded bg-[color-mix(in_oklab,var(--foreground)_8%,transparent)] px-1.5 py-px text-[11px]">เสียงประกอบ</span>}
                  </div>
                </div>
                {d.kind === "mcp" ? (
                  <>
                    <Switch
                      checked={settings.comfy_mcp_enabled === "1"}
                      onCheckedChange={async (v) => {
                        try {
                          await setSetting("comfy_mcp_enabled", v ? "1" : "0");
                          await load();
                        } catch (e) {
                          err(e);
                        }
                      }}
                      aria-label="เปิดใช้ ComfyUI MCP"
                    />
                    <Button variant="ghost" size="icon-sm" title="ตั้งค่า" onClick={() => setCfg(d)}><Settings2 /></Button>
                  </>
                ) : d.kind === "tool" ? (
                  ok ? (
                    <span className="flex items-center gap-1.5 text-[13px] text-success"><span className="size-2 rounded-full bg-success" /> ติดตั้งแล้ว</span>
                  ) : (
                    <Button variant="glass" size="sm" onClick={() => connect(d)}><Download /> ติดตั้ง</Button>
                  )
                ) : ok ? (
                  <>
                    <span className="flex items-center gap-1.5 text-[13px] text-success"><span className="size-2 rounded-full bg-success" /> เชื่อมแล้ว</span>
                    <Button variant="ghost" size="icon-sm" title="ตั้งค่า" onClick={() => (d.kind === "agent" ? onOpenAgents() : setCfg(d))}><Settings2 /></Button>
                  </>
                ) : (
                  <Button variant="glass" size="sm" onClick={() => connect(d)}>เชื่อมต่อ</Button>
                )}
              </motion.div>
            );
          })}
        </div>
        {(cat === "all" || cat === "video") && (
          <p className="text-xs text-muted-foreground">ปุ่มติดตั้งจะเปิดหน้าต่าง PowerShell ให้เห็นคำสั่งที่รัน ติดตั้งเสร็จแล้วกด “ตรวจใหม่” · Remotion ตรวจในโฟลเดอร์งานของช่องที่เลือกอยู่</p>
        )}
      </section>

      <ConfigDialog def={cfg} onClose={() => setCfg(null)} onSaved={load} status={cfg ? status[cfg.id] : undefined} />
      <AgentEditDialog
        agent={agentEdit}
        onClose={() => setAgentEdit(null)}
        onSaved={async (a) => {
          await refreshAgents();
          notify(`เชื่อมต่อ ${a.name} แล้ว`);
        }}
      />
    </div>
  );
}

function DefaultRow({ label, k, options, hint }: { label: string; k: string; options: Def[]; hint?: string }) {
  const { settings, setSetting, err } = useApp();
  const cur = settings[k] ?? "";
  const chosen = options.find((o) => o.id === cur);
  const auto = options[0];
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <span className="flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      {options.length === 0 ? (
        <span className="text-[13px] text-muted-foreground">เชื่อมต่อผู้ให้บริการที่รองรับก่อน</span>
      ) : (
        <div className="w-64">
          <Select value={chosen ? cur : "auto"} onValueChange={(v) => setSetting(k, v === "auto" ? "" : v).catch(err)}>
            <SelectTrigger className="h-8 text-[13px]">{chosen ? chosen.name : `อัตโนมัติ · ${auto.name}`}</SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">อัตโนมัติ · {auto.name}</SelectItem>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

const COMFY_PRESETS = [
  { id: "npm", label: "comfyui-mcp (npm, Node 22+) แนะนำ", cmd: "comfyui-mcp" },
  { id: "official", label: "comfy-mcp ของ Comfy-Org (Python)", cmd: "comfy-mcp" },
  { id: "custom", label: "ตั้งคำสั่งเอง", cmd: "" },
];

/** Settings of one image/audio provider. Values are saved when the user presses Save. */
function ConfigDialog({ def, onClose, onSaved, status }: { def: Def | null; onClose: () => void; onSaved: () => Promise<void>; status?: ProviderStatus }) {
  const { settings, setSetting, err, notify } = useApp();
  const [v, setV] = useState<Record<string, string>>({});
  const [key, setKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (def) {
      setV({ ...settings });
      setKey("");
      setTest(null);
    }
  }, [def]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!def) return null;
  const f = (k: string) => v[k] ?? "";
  const set = (k: string, val: string) => setV((x) => ({ ...x, [k]: val }));
  const keyed = def.id === "elevenlabs" || def.id === "openai-image";
  const fields: Record<string, string[]> = {
    comfyui: ["comfy_url", "comfy_image_cmd"],
    "comfyui-mcp": ["comfy_url", "comfy_mcp_preset", "comfy_mcp_cmd"],
    "openai-image": ["openai_image_model", "openai_image_size"],
    "custom-image": ["gen_image_cmd"],
    voicestudio: ["voice_port", "voice_cmd"],
    elevenlabs: ["elevenlabs_voice", "elevenlabs_model"],
    "custom-audio": ["gen_audio_cmd"],
  };

  async function save() {
    try {
      for (const k of fields[def!.id] ?? []) if ((v[k] ?? "") !== (settings[k] ?? "")) await setSetting(k, v[k] ?? "");
      if (keyed && key.trim()) await api.setProviderKey(def!.id, key.trim());
      await onSaved();
      notify(`บันทึก ${def!.name} แล้ว`);
      onClose();
    } catch (e) {
      err(e);
    }
  }

  const cmdHint = "คำสั่ง PowerShell ที่ต้องเขียนไฟล์ไปที่ {out} ตัวแปร: {prompt} (ใส่เครื่องหมายคำพูดให้แล้ว) {out} {workdir} {key} และ $env:MUMU_PROMPT, $env:MUMU_OUT";
  const preset = f("comfy_mcp_preset") || "npm";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(640px,94vw)]">
        <div className="flex items-center gap-3">
          <ProviderIcon d={def} />
          <div>
            <DialogTitle>{def.name}</DialogTitle>
            <DialogDescription>{status?.detail ?? def.sub}</DialogDescription>
          </div>
        </div>

        {def.id === "comfyui" && (
          <>
            <Field label="ที่อยู่ ComfyUI"><Input className="font-mono text-[13px]" value={f("comfy_url")} placeholder="http://127.0.0.1:8188" onChange={(e) => set("comfy_url", e.target.value)} /></Field>
            <Field label="คำสั่งสร้างภาพ" hint={cmdHint}>
              <Textarea rows={3} spellCheck={false} className="console text-[12.5px]" value={f("comfy_image_cmd")} placeholder={'python D:\\tools\\comfy_txt2img.py --prompt {prompt} --out "{out}"'} onChange={(e) => set("comfy_image_cmd", e.target.value)} />
            </Field>
          </>
        )}

        {def.id === "comfyui-mcp" && (
          <>
            <p className="text-[13px] text-muted-foreground">เมื่อเปิดใช้ AI agent ที่คุม flow (Claude Code) จะได้เครื่องมือของ ComfyUI เพิ่มเพื่อสร้างและแก้ภาพเอง MumuCut ไม่ได้คุมคิวการ์ดจอของงานที่ agent สั่งผ่าน MCP</p>
            <Field label="เซิร์ฟเวอร์ MCP">
              <Select value={preset} onValueChange={(x) => set("comfy_mcp_preset", x)}>
                <SelectTrigger>{COMFY_PRESETS.find((p) => p.id === preset)?.label}</SelectTrigger>
                <SelectContent>{COMFY_PRESETS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            {preset === "custom" ? (
              <Field label="คำสั่งเปิดเซิร์ฟเวอร์ (stdio)"><Input className="font-mono text-[13px]" value={f("comfy_mcp_cmd")} onChange={(e) => set("comfy_mcp_cmd", e.target.value)} /></Field>
            ) : (
              <p className="console glass-subtle rounded-md px-3 py-2 text-[12.5px]">{COMFY_PRESETS.find((p) => p.id === preset)?.cmd}  ·  COMFYUI_URL={f("comfy_url") || "http://127.0.0.1:8188"}</p>
            )}
            <Field label="ที่อยู่ ComfyUI"><Input className="font-mono text-[13px]" value={f("comfy_url")} placeholder="http://127.0.0.1:8188" onChange={(e) => set("comfy_url", e.target.value)} /></Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="glass"
                disabled={testing}
                onClick={async () => {
                  setTesting(true);
                  setTest(null);
                  try {
                    for (const k of ["comfy_url", "comfy_mcp_preset", "comfy_mcp_cmd"]) if ((v[k] ?? "") !== (settings[k] ?? "")) await setSetting(k, v[k] ?? "");
                    setTest({ ok: true, text: await api.testComfyMcp() });
                  } catch (e) {
                    setTest({ ok: false, text: String((e as Error)?.message ?? e) });
                  } finally {
                    setTesting(false);
                  }
                }}
              >
                <FlaskConical className={cn(testing && "animate-pulse")} /> {testing ? "กำลังทดสอบ…" : "ทดสอบการเชื่อมต่อ"}
              </Button>
              {preset !== "custom" && (
                <Button
                  variant="ghost"
                  onClick={() => api.runInstaller(preset === "official" ? "comfyui-mcp-official" : "comfyui-mcp-npm", null).then((c) => notify(`เปิดหน้าต่างติดตั้งแล้ว: ${c}\nเสร็จแล้วกด ทดสอบการเชื่อมต่อ`, "info")).catch(err)}
                >
                  <Download /> ติดตั้ง {preset === "official" ? "comfy-mcp" : "comfyui-mcp"}
                </Button>
              )}
            </div>
            {test && <p className={cn("whitespace-pre-wrap text-[13px]", test.ok ? "text-success" : "text-rose")}>{test.text}</p>}
          </>
        )}

        {def.id === "openai-image" && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="โมเดล"><Input className="font-mono text-[13px]" value={f("openai_image_model")} placeholder="gpt-image-1" onChange={(e) => set("openai_image_model", e.target.value)} /></Field>
            <Field label="ขนาดภาพ">
              <Select value={f("openai_image_size") || "1024x1536"} onValueChange={(x) => set("openai_image_size", x)}>
                <SelectTrigger>{f("openai_image_size") || "1024x1536"}</SelectTrigger>
                <SelectContent>
                  <SelectItem value="1024x1536">1024x1536 (แนวตั้ง)</SelectItem>
                  <SelectItem value="1024x1024">1024x1024 (จัตุรัส)</SelectItem>
                  <SelectItem value="1536x1024">1536x1024 (แนวนอน)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        )}

        {def.id === "custom-image" && (
          <Field label="คำสั่งสร้างภาพ (ได้ไฟล์ .png)" hint={cmdHint}>
            <Textarea rows={3} spellCheck={false} className="console text-[12.5px]" value={f("gen_image_cmd")} onChange={(e) => set("gen_image_cmd", e.target.value)} />
          </Field>
        )}

        {def.id === "voicestudio" && (
          <>
            <Field label="พอร์ต VoiceStudio"><Input className="w-32" value={f("voice_port")} placeholder="3900" onChange={(e) => set("voice_port", e.target.value)} /></Field>
            <Field label="คำสั่งอ่านข้อความเป็นเสียง (ได้ไฟล์ .wav)" hint={cmdHint}>
              <Textarea rows={3} spellCheck={false} className="console text-[12.5px]" value={f("voice_cmd")} onChange={(e) => set("voice_cmd", e.target.value)} />
            </Field>
          </>
        )}

        {def.id === "elevenlabs" && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Voice ID" hint="ใช้กับเสียงพูด"><Input className="font-mono text-[13px]" value={f("elevenlabs_voice")} onChange={(e) => set("elevenlabs_voice", e.target.value)} /></Field>
            <Field label="โมเดล"><Input className="font-mono text-[13px]" value={f("elevenlabs_model")} placeholder="eleven_multilingual_v2" onChange={(e) => set("elevenlabs_model", e.target.value)} /></Field>
          </div>
        )}

        {def.id === "custom-audio" && (
          <Field label="คำสั่งทำเสียง (ได้ไฟล์ .wav)" hint={cmdHint}>
            <Textarea rows={3} spellCheck={false} className="console text-[12.5px]" value={f("gen_audio_cmd")} onChange={(e) => set("gen_audio_cmd", e.target.value)} />
          </Field>
        )}

        {keyed && (
          <Field label="API key" hint={status?.ok ? "มีคีย์เก็บไว้ใน Windows Credential Manager แล้ว พิมพ์คีย์ใหม่เพื่อเปลี่ยน" : "คีย์เก็บใน Windows Credential Manager ไม่อยู่ในฐานข้อมูล"}>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input type="password" autoComplete="off" className="pl-9" value={key} placeholder={status?.ok ? "••••••••••••" : ""} onChange={(e) => setKey(e.target.value)} />
              </div>
              {status?.ok && (
                <Button
                  variant="glass"
                  onClick={async () => {
                    try {
                      await api.clearProviderKey(def.id);
                      await onSaved();
                      notify("ลบคีย์แล้ว");
                    } catch (e) {
                      err(e);
                    }
                  }}
                >
                  ลบคีย์
                </Button>
              )}
            </div>
          </Field>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={save}>บันทึก</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
