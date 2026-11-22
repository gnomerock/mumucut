import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft, Ban, Bot, CalendarClock, Check, FileText, FolderOpen, Gauge, Hand, ListChecks, Play, RotateCcw, Save, Send, Sparkles, Terminal, Trash2, Undo2, Cpu, Eye,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { providerLabel } from "@/components/AgentsCard";
import { api, fileUrl, onLog, onStatus, revealPath } from "@/lib/api";
import type { ClipDetail, Clip, ClipStatus, StepDef, StepRow, Post } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { GlassCard, CardBody, CardDesc, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipStatusBadge, StepDot, clipStatusMeta, stepStatusLabel } from "@/components/common";
import { cn, fmtDuration } from "@/lib/utils";

const kindMeta: Record<string, { label: string; icon: React.ReactNode }> = {
  pick: { label: "เลือกจากคลัง", icon: <ListChecks /> },
  ai: { label: "AI", icon: <Bot /> },
  shell: { label: "สคริปต์", icon: <Terminal /> },
  check: { label: "ตรวจไฟล์", icon: <Gauge /> },
  deliver: { label: "ลงคลัง", icon: <FolderOpen /> },
  manual: { label: "ยืนยันเอง", icon: <Hand /> },
  post: { label: "ตั้งโพสต์", icon: <CalendarClock /> },
};

export default function ClipPage() {
  const { clipId, openClip, project, refresh, err, notify } = useApp();
  const [detail, setDetail] = useState<ClipDetail | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [live, setLive] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const steps = project?.config.steps ?? [];

  const load = useCallback(async () => {
    if (clipId == null) return;
    try {
      const d = await api.clipDetail(clipId);
      setDetail(d);
    } catch (e) {
      err(e);
    }
  }, [clipId, err]);

  useEffect(() => {
    void load();
  }, [load]);

  // pick the first unfinished step once
  useEffect(() => {
    if (!detail || selected || steps.length === 0) return;
    const rows = new Map(detail.steps.map((s) => [s.step_key, s]));
    const first = steps.find((s) => !["done", "skipped"].includes(rows.get(s.key)?.status ?? "pending")) ?? steps[steps.length - 1];
    setSelected(first.key);
  }, [detail, selected, steps]);

  useEffect(() => {
    let offLog = () => {};
    let offStatus = () => {};
    onLog((e) => {
      if (e.clip_id !== clipId) return;
      setLive((l) => ({ ...l, [e.step]: [...(l[e.step] ?? []).slice(-1500), e.line] }));
    }).then((f) => (offLog = f));
    onStatus((e) => {
      if (e.clip_id !== clipId) return;
      void load();
      void refresh();
    }).then((f) => (offStatus = f));
    return () => {
      offLog();
      offStatus();
    };
  }, [clipId, load, refresh]);

  if (!detail || !project) return null;
  const { clip } = detail;
  const rows = new Map(detail.steps.map((s) => [s.step_key, s]));
  const def = steps.find((s) => s.key === selected) ?? steps[0];
  const row = rows.get(def?.key ?? "");
  const anyRunning = detail.steps.some((s) => s.status === "running");

  async function run(key: string) {
    setLive((l) => ({ ...l, [key]: [] }));
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      await api.runStep(clip.id, key);
    } catch (e) {
      err(e);
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
      await load();
      await refresh();
    }
  }

  async function mark(key: string, status: "done" | "pending" | "review" | "skipped") {
    try {
      await api.setStepStatus(clip.id, key, status);
      await load();
      await refresh();
    } catch (e) {
      err(e);
    }
  }

  async function setStatus(s: ClipStatus) {
    try {
      await api.updateClip(clip.id, { status: s });
      await load();
      await refresh();
    } catch (e) {
      err(e);
    }
  }

  async function remove() {
    if (!window.confirm(`ลบ ${clip.clip_key} ออกจากโปรแกรม? (ไฟล์วิดีโอบนดิสก์ไม่ถูกลบ)`)) return;
    try {
      await api.deleteClip(clip.id);
      await refresh();
      openClip(null);
      notify(`ลบ ${clip.clip_key} แล้ว`);
    } catch (e) {
      err(e);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 pb-4">
        <div className="flex items-start gap-3">
          <Button variant="glass" size="icon" onClick={() => openClip(null)} aria-label="กลับ">
            <ArrowLeft />
          </Button>
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-sm text-muted-foreground">{clip.clip_key}</span>
              <ClipStatusBadge status={clip.status} />
            </div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight">{clip.title || "(ยังไม่มีชื่อ)"}</h1>
            <p className="text-sm text-muted-foreground">
              {clip.ref || "ยังไม่ได้เลือกหัวข้อ"}
              {clip.duration != null && `, ${fmtDuration(clip.duration)}`}
              {clip.lufs != null && `, ${clip.lufs.toFixed(1)} LUFS`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-40">
            <Select value={clip.status} onValueChange={(v) => setStatus(v as ClipStatus)}>
              <SelectTrigger className="h-8 text-[13px]">{clipStatusMeta[clip.status].label}</SelectTrigger>
              <SelectContent>
                {(Object.keys(clipStatusMeta) as ClipStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {clipStatusMeta[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {clip.video_path && (
            <Button variant="glass" size="icon-sm" title="เปิดโฟลเดอร์ไฟล์" onClick={() => revealPath(clip.video_path!)}>
              <FolderOpen />
            </Button>
          )}
          <Button variant="destructive" size="icon-sm" title="ลบจากโปรแกรม" onClick={remove}>
            <Trash2 />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="flow">
        <TabsList>
          <TabsTrigger value="flow"><ListChecks /> ขั้นตอน</TabsTrigger>
          <TabsTrigger value="info"><FileText /> ข้อมูล</TabsTrigger>
          <TabsTrigger value="script"><Sparkles /> บท</TabsTrigger>
          <TabsTrigger value="posts"><Send /> โพสต์ ({detail.posts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="flow" className="pt-4">
          {project.config.run_mode === "agent" && (
            <FlowAgentPanel
              clip={clip}
              row={rows.get("__flow__")}
              live={live["__flow__"]}
              running={rows.get("__flow__")?.status === "running" || !!busy["__flow__"]}
              waiting={steps.find((x) => rows.get(x.key)?.status === "review")?.label}
              onStart={async () => {
                setLive((l) => ({ ...l, __flow__: [] }));
                setBusy((b) => ({ ...b, __flow__: true }));
                try {
                  await api.runFlow(clip.id);
                } catch (e) {
                  err(e);
                } finally {
                  setBusy((b) => ({ ...b, __flow__: false }));
                  await load();
                  await refresh();
                }
              }}
              onCancel={() => api.cancelStep(clip.id, "__flow__").catch(err)}
            />
          )}
          <div className="grid grid-cols-[270px_1fr] gap-4">
            <GlassCard className="self-start p-2">
              <ol className="relative grid">
                {steps.map((s, i) => {
                  const r = rows.get(s.key);
                  const st = r?.status ?? "pending";
                  const active = s.key === def?.key;
                  return (
                    <li key={s.key} className="relative">
                      {i < steps.length - 1 && <span className="absolute bottom-[-6px] left-[19px] top-[34px] w-px bg-[var(--glass-hairline)]" />}
                      <button
                        onClick={() => setSelected(s.key)}
                        className={cn(
                          "soft relative flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active ? "bg-[var(--glass-bg-strong)]" : "hover:bg-[var(--glass-bg-subtle)]",
                        )}
                      >
                        <StepDot status={st} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{s.label}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {kindMeta[s.kind]?.label}
                            {s.gate ? ", ต้องตรวจ" : ""}
                          </span>
                        </span>
                        {st !== "pending" && st !== "done" && <span className="text-[11px] text-muted-foreground">{stepStatusLabel[st]}</span>}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </GlassCard>

            <AnimatePresence mode="wait" initial={false}>
              {def && (
                <motion.div key={def.key} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                  <StepPanel
                    def={def}
                    row={row}
                    clip={clip}
                    live={live[def.key]}
                    busy={!!busy[def.key]}
                    otherRunning={anyRunning && row?.status !== "running"}
                    onRun={() => run(def.key)}
                    onCancel={async () => {
                      await api.cancelStep(clip.id, def.key);
                    }}
                    onMark={(s) => mark(def.key, s)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </TabsContent>

        <TabsContent value="info" className="pt-4">
          <InfoTab clip={clip} onSaved={async () => { await load(); await refresh(); }} />
        </TabsContent>
        <TabsContent value="script" className="pt-4">
          <ScriptTab clip={clip} onSaved={async () => { await load(); }} />
        </TabsContent>
        <TabsContent value="posts" className="pt-4">
          <PostsTab clip={clip} posts={detail.posts} onChange={async () => { await load(); await refresh(); }} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StepPanel({
  def, row, clip, live, busy, otherRunning, onRun, onCancel, onMark,
}: {
  def: StepDef;
  row?: StepRow;
  clip: Clip;
  live?: string[];
  busy: boolean;
  otherRunning: boolean;
  onRun: () => void;
  onCancel: () => void;
  onMark: (s: "done" | "pending" | "review" | "skipped") => void;
}) {
  const { project } = useApp();
  const status = row?.status ?? "pending";
  const lines = useMemo(() => (live && live.length ? live : (row?.log ?? "").split("\n").filter(Boolean)), [live, row?.log]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  const [previewUrl, setPreviewUrl] = useState<string>();
  useEffect(() => {
    let off = false;
    setPreviewUrl(undefined);
    if (!def.preview || !project) return;
    api.resolvePath(project.workdir, def.preview, clip.clip_key).then((p) => {
      if (!off) setPreviewUrl(fileUrl(p) ? `${fileUrl(p)}?t=${row?.finished_at ?? ""}` : undefined);
    });
    return () => {
      off = true;
    };
  }, [def.preview, project, clip.clip_key, row?.finished_at]);

  const manual = def.kind === "manual" || def.kind === "post";
  const running = status === "running" || busy;

  return (
    <GlassCard>
      <CardHeader>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">{def.label}</CardTitle>
            <Badge>{kindMeta[def.kind]?.icon}{kindMeta[def.kind]?.label}</Badge>
            {def.gpu && <Badge tone="warning"><Cpu className="size-3" />ใช้การ์ดจอ</Badge>}
            {def.gate && <Badge tone="info"><Eye className="size-3" />ต้องตรวจก่อนไปต่อ</Badge>}
          </div>
          <CardDesc className="mt-1">{def.desc}</CardDesc>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {running ? (
            <Button variant="glass" size="sm" onClick={onCancel}>
              <Ban /> ยกเลิก
            </Button>
          ) : status === "review" ? (
            <>
              <Button size="sm" onClick={() => onMark("done")}>
                <Check /> อนุมัติ
              </Button>
              <Button variant="glass" size="sm" onClick={onRun} disabled={otherRunning}>
                <RotateCcw /> ทำใหม่
              </Button>
            </>
          ) : manual ? (
            status === "done" ? (
              <Button variant="glass" size="sm" onClick={() => onMark("pending")}>
                <Undo2 /> ยกเลิกการยืนยัน
              </Button>
            ) : (
              <Button size="sm" onClick={() => onMark("done")}>
                <Check /> ยืนยันว่าเสร็จ
              </Button>
            )
          ) : (
            <Button size="sm" onClick={onRun} disabled={otherRunning}>
              {status === "done" || status === "failed" ? <RotateCcw /> : <Play />}
              {status === "done" || status === "failed" ? "รันใหม่" : "รัน"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardBody className="grid gap-3">
        {previewUrl && (
          <div className="glass-subtle overflow-hidden rounded-md">
            <img src={previewUrl} alt="ตัวอย่าง" className="max-h-[420px] w-full object-contain" />
          </div>
        )}
        {def.kind === "post" ? (
          <p className="text-sm text-muted-foreground">บันทึกเวลาโพสต์และลิงก์ในแท็บ “โพสต์” แล้วกดยืนยันเมื่อเรียบร้อย</p>
        ) : (
          <div className="glass-subtle console max-h-[340px] min-h-[140px] overflow-auto rounded-md p-3">
            {lines.length === 0 ? (
              <span className="text-muted-foreground">{running ? "กำลังเริ่ม…" : "ยังไม่มี log กด “รัน” เพื่อเริ่มขั้นตอนนี้"}</span>
            ) : (
              lines.map((l, i) => (
                <div key={i} className={cn("whitespace-pre-wrap break-words", l.startsWith("✗") || l.includes("ล้มเหลว") ? "text-rose" : l.startsWith("✓") ? "text-success" : "")}>
                  {l}
                </div>
              ))
            )}
            <div ref={end} />
          </div>
        )}
        {def.kind !== "manual" && def.kind !== "post" && def.kind !== "check" && def.kind !== "pick" && def.kind !== "deliver" && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">คำสั่ง/Prompt ของขั้นตอนนี้</summary>
            <pre className="console glass-subtle mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-md p-3 text-[12px]">{def.kind === "ai" ? def.prompt : def.cmd}</pre>
          </details>
        )}
      </CardBody>
    </GlassCard>
  );
}

function InfoTab({ clip, onSaved }: { clip: Clip; onSaved: () => Promise<void> }) {
  const { err, notify } = useApp();
  const [f, setF] = useState({ title: clip.title, ref: clip.ref, brief: clip.brief, caption: clip.caption, notes: clip.notes });
  useEffect(() => setF({ title: clip.title, ref: clip.ref, brief: clip.brief, caption: clip.caption, notes: clip.notes }), [clip.id, clip.updated_at]); // eslint-disable-line
  const video = fileUrl(clip.video_path);
  const dirty = f.title !== clip.title || f.ref !== clip.ref || f.brief !== clip.brief || f.caption !== clip.caption || f.notes !== clip.notes;
  return (
    <div className="grid grid-cols-[1fr_260px] gap-4">
      <GlassCard>
        <CardBody className="grid gap-4 pt-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="ชื่อคลิป"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Field label="อ้างอิง/ที่มา"><Input value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></Field>
          </div>
          <Field label="ต้นฉบับ/โจทย์ที่ให้ AI" hint="ข้อความนี้ถูกส่งเข้า prompt เป็น {brief}">
            <Textarea rows={4} value={f.brief} onChange={(e) => setF({ ...f, brief: e.target.value })} />
          </Field>
          <Field label="แคปชันโพสต์"><Textarea rows={7} value={f.caption} onChange={(e) => setF({ ...f, caption: e.target.value })} /></Field>
          <Field label="บันทึก"><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          <div>
            <Button
              disabled={!dirty}
              onClick={async () => {
                try {
                  await api.updateClip(clip.id, f);
                  await onSaved();
                  notify("บันทึกแล้ว");
                } catch (e) {
                  err(e);
                }
              }}
            >
              <Save /> บันทึก
            </Button>
          </div>
        </CardBody>
      </GlassCard>
      <GlassCard className="self-start overflow-hidden">
        {video ? (
          <video src={video} controls className="aspect-[9/16] w-full bg-black/80 object-contain" poster={fileUrl(clip.cover_path)} />
        ) : (
          <div className="grid aspect-[9/16] place-items-center px-4 text-center text-sm text-muted-foreground">ยังไม่มีวิดีโอ จะแสดงหลังขั้นตอนเรนเดอร์/ตรวจไฟล์</div>
        )}
      </GlassCard>
    </div>
  );
}

function ScriptTab({ clip, onSaved }: { clip: Clip; onSaved: () => Promise<void> }) {
  const { err, notify, project } = useApp();
  const [text, setText] = useState(clip.script);
  useEffect(() => setText(clip.script), [clip.id, clip.script]);
  let valid = true;
  let lines: { text: string; emphasis?: string[] }[] = [];
  try {
    const j = JSON.parse(text);
    lines = Array.isArray(j.lines) ? j.lines : [];
  } catch {
    valid = text.trim() === "";
  }
  return (
    <div className="grid grid-cols-[1fr_320px] gap-4">
      <GlassCard>
        <CardHeader>
          <div>
            <CardTitle>บท (JSON)</CardTitle>
            <CardDesc>แก้เองได้ ถ้าบันทึกลงไฟล์ ขั้นตอนถัดไปจะใช้ไฟล์นี้</CardDesc>
          </div>
        </CardHeader>
        <CardBody className="grid gap-3">
          <Textarea className="console min-h-[360px] text-[12.5px]" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
          <div className="flex items-center gap-2">
            <Button
              disabled={!valid || text === clip.script}
              onClick={async () => {
                try {
                  await api.updateClip(clip.id, { script: text });
                  await onSaved();
                  notify("บันทึกบทแล้ว");
                } catch (e) {
                  err(e);
                }
              }}
            >
              <Save /> บันทึก
            </Button>
            {project?.config.steps.find((s) => s.key === "script")?.output_file && (
              <Button
                variant="glass"
                disabled={!valid || !text.trim()}
                onClick={async () => {
                  try {
                    const out = project!.config.steps.find((s) => s.key === "script")!.output_file;
                    const p = await api.resolvePath(project!.workdir, out, clip.clip_key);
                    await api.writeText(p, text);
                    await api.updateClip(clip.id, { script: text });
                    notify(`เขียนไฟล์แล้ว\n${p}`);
                  } catch (e) {
                    err(e);
                  }
                }}
              >
                <FileText /> บันทึกลงไฟล์บท
              </Button>
            )}
            {!valid && <span className="text-sm text-rose">JSON ไม่ถูกต้อง</span>}
          </div>
        </CardBody>
      </GlassCard>
      <GlassCard className="self-start">
        <CardHeader><CardTitle>บรรทัดบรรยาย</CardTitle></CardHeader>
        <CardBody className="grid gap-2">
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีบท รันขั้นตอน “เขียนบท”</p>
          ) : (
            lines.map((l, i) => (
              <div key={i} className="glass-subtle rounded-md px-3 py-2 text-sm">
                <span className="mr-2 font-mono text-xs text-muted-foreground">{i + 1}</span>
                {l.text}
              </div>
            ))
          )}
        </CardBody>
      </GlassCard>
    </div>
  );
}

const platforms = [
  { id: "facebook", label: "Facebook Reels" },
  { id: "youtube", label: "YouTube Shorts" },
  { id: "tiktok", label: "TikTok" },
  { id: "other", label: "อื่น ๆ" },
];

function PostsTab({ clip, posts, onChange }: { clip: Clip; posts: Post[]; onChange: () => Promise<void> }) {
  const { err, notify } = useApp();
  const [platform, setPlatform] = useState("facebook");
  const [when, setWhen] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="grid grid-cols-[1fr_340px] gap-4">
      <GlassCard className="self-start">
        <CardHeader><CardTitle>โพสต์ของคลิปนี้</CardTitle></CardHeader>
        <CardBody className="pt-2">
          {posts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีโพสต์ที่บันทึกไว้</p>
          ) : (
            <div className="grid divide-y divide-[var(--glass-hairline)]">
              {posts.map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {platforms.find((x) => x.id === p.platform)?.label ?? p.platform}
                      <Badge tone={p.status === "posted" ? "success" : p.status === "cancelled" ? "neutral" : "info"}>{p.status === "posted" ? "โพสต์แล้ว" : p.status === "cancelled" ? "ยกเลิก" : "ตั้งเวลา"}</Badge>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{p.scheduled_at || "ไม่ระบุเวลา"}{p.url ? `, ${p.url}` : ""}</div>
                  </div>
                  {p.status === "scheduled" && (
                    <Button variant="glass" size="sm" onClick={async () => { try { await api.updatePost(p.id, "posted"); await onChange(); } catch (e) { err(e); } }}>
                      <Check /> โพสต์แล้ว
                    </Button>
                  )}
                  {p.status !== "cancelled" && p.status !== "posted" && (
                    <Button variant="ghost" size="sm" onClick={async () => { try { await api.updatePost(p.id, "cancelled"); await onChange(); } catch (e) { err(e); } }}>ยกเลิก</Button>
                  )}
                  <Button variant="destructive" size="icon-sm" title="ลบรายการ" onClick={async () => { try { await api.deletePost(p.id); await onChange(); } catch (e) { err(e); } }}><Trash2 /></Button>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </GlassCard>
      <GlassCard className="self-start">
        <CardHeader>
          <div>
            <CardTitle>เพิ่มโพสต์</CardTitle>
            <CardDesc>กันโพสต์ซ้ำ: คลิปเดียวกันบนแพลตฟอร์มเดียวกันบันทึกได้ครั้งเดียว</CardDesc>
          </div>
        </CardHeader>
        <CardBody className="grid gap-3">
          <Field label="แพลตฟอร์ม">
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>{platforms.find((p) => p.id === platform)?.label}</SelectTrigger>
              <SelectContent>{platforms.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="เวลาโพสต์"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
          <Field label="ลิงก์โพสต์"><Input placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
          <Field label="หมายเหตุ"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <Button
            onClick={async () => {
              try {
                await api.addPost(clip.id, platform, when.replace("T", " "), url, note);
                setUrl(""); setNote("");
                await onChange();
                notify("บันทึกโพสต์แล้ว");
              } catch (e) {
                err(e);
              }
            }}
          >
            <CalendarClock /> บันทึก
          </Button>
        </CardBody>
      </GlassCard>
    </div>
  );
}

function FlowAgentPanel({ clip, row, live, running, waiting, onStart, onCancel }: { clip: Clip; row?: StepRow; live?: string[]; running: boolean; waiting?: string; onStart: () => void; onCancel: () => void }) {
  const { project, agents } = useApp();
  const agent = agents.find((a) => String(a.id) === project?.config.flow_agent) ?? agents.find((a) => a.is_default);
  const lines = useMemo(() => (live && live.length ? live : (row?.log ?? "").split("\n").filter(Boolean)), [live, row?.log]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);
  const finished = (project?.config.steps ?? []).length > 0 && clip.done_steps >= (project?.config.steps.length ?? 0);
  return (
    <GlassCard className="mb-4">
      <CardHeader>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">agent คุม flow</CardTitle>
            {agent && <Badge>{agent.name}</Badge>}
            {agent && <Badge>{providerLabel(agent.provider)}</Badge>}
            {agent?.model && <Badge>{agent.model}</Badge>}
          </div>
          <CardDesc className="mt-1">{waiting ? `agent หยุดรอคุณตรวจขั้นตอน ${waiting} เปิดดูผลทางซ้าย แล้วกดอนุมัติ จึงจะให้ agent ทำต่อได้` : "agent รันขั้นตอนตามลำดับ เขียนบทเอง และหยุดรอคุณที่จุดตรวจ (ขั้นตอนที่ติดป้าย ต้องตรวจ)"}</CardDesc>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {running ? (
            <Button variant="glass" size="sm" onClick={onCancel}>
              <Ban /> หยุด agent
            </Button>
          ) : (
            <Button size="sm" onClick={onStart} disabled={!agent || finished || !!waiting} title={waiting ? `อนุมัติขั้นตอน ${waiting} ก่อน` : undefined}>
              <Play /> {clip.done_steps > 0 ? "ให้ agent ทำต่อ" : "ให้ agent เริ่มทำ"}
            </Button>
          )}
        </div>
      </CardHeader>
      {(lines.length > 0 || running) && (
        <CardBody className="pt-1">
          <div className="glass-subtle console max-h-[300px] min-h-[96px] overflow-auto rounded-md p-3">
            {lines.length === 0 ? (
              <span className="text-muted-foreground">กำลังเริ่ม</span>
            ) : (
              lines.map((l, i) => (
                <div key={i} className={cn("whitespace-pre-wrap break-words", l.startsWith("✗") ? "text-rose" : l.startsWith("✓") ? "text-success" : l.startsWith("เรียก ") ? "text-muted-foreground" : "")}>
                  {l}
                </div>
              ))
            )}
            <div ref={end} />
          </div>
        </CardBody>
      )}
    </GlassCard>
  );
}
