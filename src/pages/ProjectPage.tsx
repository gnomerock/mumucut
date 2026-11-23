import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft, Clapperboard, Copy, ExternalLink, FileText, FolderOpen, Images, KeyRound, Library, Link2, Paperclip, Plus, Save, Send, Share2, Sparkles, Trash2, Upload, Wand2, CalendarClock, Check,
} from "lucide-react";
import { useApp, type ProjectTab } from "@/lib/store";
import { api, fileUrl, onLog, onStatus, openPath, openUrl, pickFiles, revealPath } from "@/lib/api";
import type { AffiliateLink, Asset, Clip, ClipAffiliate, ClipDetail, ClipStatus, Post, SocialAccount, SocialPlatform } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { GlassCard, CardBody, CardDesc, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ClipStatusBadge, Empty, StepDot, clipStatusMeta, stepStatusLabel } from "@/components/common";
import { AiAssetDialog, AssetGrid } from "@/components/assets";
import { LinkDialog, ShopBadge } from "@/components/affiliate";
import { FlowAgentPanel, StepPanel, kindMeta } from "@/components/flow";
import { cn, fmtDuration } from "@/lib/utils";

const tabs: { id: ProjectTab; label: string; icon: React.ReactNode }[] = [
  { id: "scripts", label: "Scripts", icon: <FileText /> },
  { id: "assets", label: "Assets", icon: <Images /> },
  { id: "editor", label: "Editor", icon: <Clapperboard /> },
  { id: "affiliate", label: "Affiliate", icon: <Link2 /> },
  { id: "publish", label: "Publish", icon: <Send /> },
];

/** One clip project: header + tab bar Scripts / Assets / Editor / Affiliate / Publish. */
export default function ProjectPage() {
  const { clipId, openClip, project, refresh, err, notify, tab, setTab, confirm } = useApp();
  const [detail, setDetail] = useState<ClipDetail | null>(null);
  const [live, setLive] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (clipId == null) return;
    try {
      setDetail(await api.clipDetail(clipId));
    } catch (e) {
      err(e);
    }
  }, [clipId, err]);

  useEffect(() => {
    void load();
  }, [load]);

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
  const reload = async () => {
    await load();
    await refresh();
  };

  async function runStep(key: string) {
    setLive((l) => ({ ...l, [key]: [] }));
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      await api.runStep(clip.id, key);
    } catch (e) {
      err(e);
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
      await reload();
    }
  }

  async function setStatus(s: ClipStatus) {
    try {
      await api.updateClip(clip.id, { status: s });
      await reload();
    } catch (e) {
      err(e);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `ลบโปรเจกต์ ${clip.clip_key}${clip.title ? ` “${clip.title}”` : ""}?`,
      desc: "บท ขั้นตอน assets ลิงก์ affiliate และประวัติโพสต์ของโปรเจกต์นี้จะถูกลบออกจากโปรแกรม ย้อนกลับไม่ได้\nไฟล์บนดิสก์ (วิดีโอ ภาพ เสียง) ไม่ถูกลบ",
      confirmLabel: "ลบโปรเจกต์",
    });
    if (!ok) return;
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
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="glass" size="icon" onClick={() => openClip(null)} aria-label="กลับไปรายการโปรเจกต์" title="กลับไปรายการโปรเจกต์">
            <ArrowLeft />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <span>{project.name}</span>
              <span>/</span>
              <span className="font-mono">{clip.clip_key}</span>
              <ClipStatusBadge status={clip.status} />
            </div>
            <h1 className="truncate text-[22px] font-semibold leading-tight tracking-tight">{clip.title || "(ยังไม่มีชื่อ)"}</h1>
            <p className="truncate text-sm text-muted-foreground">
              {clip.brief.split("\n").find((s) => s.trim()) || clip.ref || "ยังไม่ได้ใส่ว่าคลิปนี้เล่าเรื่องอะไร (แท็บ Scripts)"}
              {clip.duration != null && ` · ${fmtDuration(clip.duration)}`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="w-36">
            <Select value={clip.status} onValueChange={(v) => setStatus(v as ClipStatus)}>
              <SelectTrigger className="h-8 text-[13px]" aria-label="สถานะ">{clipStatusMeta[clip.status].label}</SelectTrigger>
              <SelectContent>
                {(Object.keys(clipStatusMeta) as ClipStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{clipStatusMeta[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="destructive" size="icon-sm" title="ลบโปรเจกต์จากโปรแกรม" onClick={remove}>
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="glass-subtle mb-4 flex w-fit gap-0.5 rounded-lg p-1" role="tablist" aria-label="เมนูโปรเจกต์">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "soft relative flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4",
              tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab === t.id && <motion.span layoutId="project-tab" className="absolute inset-0 rounded-md bg-[var(--glass-bg-strong)] shadow-sm ring-1 ring-[var(--glass-hairline)]" transition={{ duration: 0.25 }} />}
            <span className="relative flex items-center gap-2">
              {t.icon}
              {t.label}
            </span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
          {tab === "scripts" && <ScriptsTab clip={clip} running={!!busy.script || detail.steps.some((s) => s.step_key === "script" && s.status === "running")} onRunScriptStep={() => runStep("script")} onSaved={reload} />}
          {tab === "assets" && <AssetsTab clip={clip} />}
          {tab === "editor" && <EditorTab detail={detail} live={live} busy={busy} setBusy={setBusy} setLive={setLive} onRun={runStep} onChanged={reload} />}
          {tab === "affiliate" && <AffiliateTab clip={clip} />}
          {tab === "publish" && <PublishTab clip={clip} posts={detail.posts} onChanged={reload} onRunCaptionStep={() => runStep("caption")} captionRunning={!!busy.caption} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------- Scripts
function ScriptsTab({ clip, running, onRunScriptStep, onSaved }: { clip: Clip; running: boolean; onRunScriptStep: () => void; onSaved: () => Promise<void> }) {
  const { err, notify, project } = useApp();
  const [f, setF] = useState({ title: clip.title, ref: clip.ref, brief: clip.brief, notes: clip.notes });
  const [text, setText] = useState(clip.script);
  const [writing, setWriting] = useState(false);
  useEffect(() => setF({ title: clip.title, ref: clip.ref, brief: clip.brief, notes: clip.notes }), [clip.id, clip.updated_at]); // eslint-disable-line
  useEffect(() => setText(clip.script), [clip.id, clip.script]);
  const scriptStep = project?.config.steps.find((s) => s.key === "script" && s.kind === "ai");
  const infoDirty = f.title !== clip.title || f.ref !== clip.ref || f.brief !== clip.brief || f.notes !== clip.notes;

  let isJson = false;
  let lines: string[] = [];
  try {
    const j = JSON.parse(text);
    isJson = true;
    lines = Array.isArray(j.lines) ? j.lines.map((l: { text?: string }) => l.text ?? "") : [];
  } catch {
    lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
  }
  const brokenJson = !isJson && text.trim().startsWith("{");

  async function aiWrite() {
    if (scriptStep) {
      if (infoDirty) await api.updateClip(clip.id, f);
      onRunScriptStep();
      return;
    }
    setWriting(true);
    try {
      const ans = await api.aiWrite(
        `เขียนบทพากย์คลิปสั้นแนวตั้งไม่เกิน ${project?.config.max_seconds ?? 30} วินาที สำหรับช่อง "${project?.name}" (${project?.config.description || "-"})\nชื่อคลิป: ${f.title}\nเรื่อง: ${f.brief}\n\nเขียนเป็นบรรทัดละหนึ่งประโยคที่พูดได้ ภาษาไทย ไม่มีคำอธิบายอื่น`,
      );
      setText(ans);
      notify("AI เขียนบทแล้ว ตรวจแล้วกดบันทึก");
    } catch (e) {
      err(e);
    } finally {
      setWriting(false);
    }
  }

  return (
    <div className="grid grid-cols-[320px_1fr] gap-4">
      <GlassCard className="self-start">
        <CardHeader>
          <div>
            <CardTitle>เรื่องของคลิป</CardTitle>
            <CardDesc>โจทย์ที่ AI ใช้เขียนบท</CardDesc>
          </div>
        </CardHeader>
        <CardBody className="grid gap-3.5">
          <Field label="ชื่อคลิป"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="คลิปนี้เล่าเรื่องอะไร" hint="ส่งเข้า prompt เป็น {brief}"><Textarea rows={6} value={f.brief} onChange={(e) => setF({ ...f, brief: e.target.value })} /></Field>
          <Field label="อ้างอิง/ที่มา"><Input value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></Field>
          <Field label="บันทึก"><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          <Button
            disabled={!infoDirty}
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
        </CardBody>
      </GlassCard>

      <div className="grid gap-4 self-start">
        <GlassCard>
          <CardHeader>
            <div>
              <CardTitle>บท</CardTitle>
              <CardDesc>
                {scriptStep ? "AI เขียนบทตามขั้นตอน “เขียนบท” ของช่อง (JSON) แก้เองได้" : "พิมพ์บทเอง บรรทัดละหนึ่งประโยค หรือให้ AI ร่างให้"}
              </CardDesc>
            </div>
            <Button variant="glass" size="sm" onClick={aiWrite} disabled={writing || running || (!f.title.trim() && !f.brief.trim() && !scriptStep)}>
              <Sparkles className={cn((writing || running) && "animate-pulse")} /> {writing || running ? "AI กำลังเขียน…" : clip.script ? "AI เขียนใหม่" : "AI เขียนบท"}
            </Button>
          </CardHeader>
          <CardBody className="grid gap-3">
            <Textarea className={cn("min-h-[300px] text-[13px]", isJson && "console")} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} placeholder="บรรทัดที่ 1: คำถามเปิดเรื่อง…" />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={text === clip.script || brokenJson}
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
                <Save /> บันทึกบท
              </Button>
              {scriptStep?.output_file && (
                <Button
                  variant="glass"
                  disabled={!isJson || !text.trim()}
                  title="เขียนลงไฟล์ที่ขั้นตอนถัดไปอ่าน"
                  onClick={async () => {
                    try {
                      const p = await api.resolvePath(project!.workdir, scriptStep.output_file, clip.clip_key);
                      await api.writeText(p, text);
                      await api.updateClip(clip.id, { script: text });
                      await onSaved();
                      notify(`เขียนไฟล์แล้ว\n${p}`);
                    } catch (e) {
                      err(e);
                    }
                  }}
                >
                  <FileText /> บันทึกลงไฟล์บท
                </Button>
              )}
              <span className="text-xs text-muted-foreground">{isJson ? "รูปแบบ JSON" : "ข้อความธรรมดา"} · {lines.length} บรรทัด</span>
              {brokenJson && <span className="text-sm text-rose">JSON ไม่ถูกต้อง</span>}
            </div>
          </CardBody>
        </GlassCard>
        {lines.length > 0 && (
          <GlassCard>
            <CardHeader><CardTitle>บรรทัดบรรยาย</CardTitle></CardHeader>
            <CardBody className="grid gap-1.5">
              {lines.map((l, i) => (
                <div key={i} className="glass-subtle rounded-md px-3 py-2 text-sm">
                  <span className="mr-2 font-mono text-xs text-muted-foreground">{i + 1}</span>
                  {l}
                </div>
              ))}
            </CardBody>
          </GlassCard>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Assets
function scriptText(clip: Clip) {
  try {
    const j = JSON.parse(clip.script);
    return Array.isArray(j.lines) ? j.lines.map((l: { text?: string }) => l.text).join(" / ") : clip.script;
  } catch {
    return clip.script;
  }
}

function AssetsTab({ clip }: { clip: Clip }) {
  const { project, err, notify, confirm } = useApp();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [ai, setAi] = useState(false);
  const [picking, setPicking] = useState(false);
  const load = useCallback(async () => {
    try {
      setAssets(await api.assets(project?.id ?? null, clip.id));
    } catch (e) {
      err(e);
    }
  }, [clip.id, project?.id, err]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="grid gap-4">
      <GlassCard>
        <CardHeader className="pb-4">
          <div>
            <CardTitle>ไฟล์ประกอบของ {clip.clip_key}</CardTitle>
            <CardDesc>รูป วิดีโอ เสียง ที่ใช้ในคลิปนี้ หยิบจากคลังกลาง เพิ่มไฟล์เอง หรือให้ AI สร้าง</CardDesc>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="glass" size="sm" onClick={() => setPicking(true)}><Library /> เลือกจากคลัง</Button>
            <Button
              variant="glass"
              size="sm"
              onClick={async () => {
                const paths = await pickFiles();
                if (!paths.length) return;
                try {
                  const added = await api.addAssets(paths, project?.id ?? null, clip.id);
                  await load();
                  notify(`เพิ่ม ${added.length} ไฟล์`);
                } catch (e) {
                  err(e);
                }
              }}
            >
              <Plus /> เพิ่มไฟล์
            </Button>
            <Button size="sm" onClick={() => setAi(true)}><Wand2 /> AI สร้างภาพ/เสียง</Button>
          </div>
        </CardHeader>
      </GlassCard>

      <AssetGrid
        assets={assets}
        emptyTitle="ยังไม่มีไฟล์ในโปรเจกต์นี้"
        emptyDesc="กด AI สร้างภาพ/เสียง เพื่อให้ AI ร่าง prompt จากบทแล้วสร้างไฟล์ให้ หรือหยิบของที่มีในคลัง"
        actions={(a) =>
          a.source !== "library" && (
            <Button
              variant="ghost"
              size="sm"
              title="เพิ่มไฟล์นี้เข้าคลังกลาง ให้โปรเจกต์อื่นใช้ได้"
              onClick={async () => {
                try {
                  await api.shareAsset(a.id);
                  notify(`เพิ่ม ${a.name} เข้าคลังแล้ว`);
                } catch (e) {
                  err(e);
                }
              }}
            >
              <Share2 /> เข้าคลัง
            </Button>
          )
        }
        onDelete={async (a) => {
          const ok = await confirm({ title: `เอา ${a.name} ออกจากโปรเจกต์นี้?`, desc: "ไฟล์บนดิสก์ไม่ถูกลบ ถ้าไฟล์อยู่ในคลังกลางก็ยังอยู่ในคลัง", confirmLabel: "เอาออก" });
          if (!ok) return;
          try {
            await api.deleteAsset(a.id);
            await load();
          } catch (e) {
            err(e);
          }
        }}
      />

      <AiAssetDialog
        open={ai}
        onOpenChange={setAi}
        channelId={project?.id ?? null}
        clipId={clip.id}
        context={`ช่อง ${project?.name}: ${project?.config.description ?? ""}\nคลิป: ${clip.title}\nเรื่อง: ${clip.brief}\nบท: ${scriptText(clip)}`}
        onCreated={() => void load()}
      />
      <LibraryPicker open={picking} onOpenChange={setPicking} clip={clip} usedPaths={assets.map((a) => a.path)} onPicked={() => void load()} />
    </div>
  );
}

function LibraryPicker({ open, onOpenChange, clip, usedPaths, onPicked }: { open: boolean; onOpenChange: (o: boolean) => void; clip: Clip; usedPaths: string[]; onPicked: () => void }) {
  const { project, err, notify, go } = useApp();
  const [lib, setLib] = useState<Asset[]>([]);
  useEffect(() => {
    if (open) api.assets(project?.id ?? null).then(setLib).catch(err);
  }, [open, project?.id, err]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(900px,94vw)]">
        <div>
          <DialogTitle>เลือกจากคลัง assets</DialogTitle>
          <DialogDescription>ไฟล์เดิม ไม่ถูกคัดลอก กดใช้เพื่อเพิ่มเข้า {clip.clip_key}</DialogDescription>
        </div>
        <AssetGrid
          assets={lib}
          emptyTitle="คลังยังว่าง"
          emptyDesc="เพิ่มไฟล์ที่ใช้ซ้ำได้ที่เมนู Assets library"
          actions={(a) =>
            usedPaths.includes(a.path) ? (
              <Badge tone="success"><Check className="size-3" />ใช้แล้ว</Badge>
            ) : (
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await api.useLibraryAsset(a.id, clip.id);
                    onPicked();
                    notify(`เพิ่ม ${a.name} แล้ว`);
                  } catch (e) {
                    err(e);
                  }
                }}
              >
                <Plus /> ใช้
              </Button>
            )
          }
        />
        <div className="flex justify-between">
          <Button variant="ghost" onClick={() => { onOpenChange(false); go("assets"); }}>ไปที่ Assets library</Button>
          <Button variant="glass" onClick={() => onOpenChange(false)}>เสร็จ</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Editor
const rendererLabel: Record<string, string> = { remotion: "Remotion", hyperframes: "HyperFrames", manual: "ตัดต่อเอง" };

function EditorTab({
  detail, live, busy, setBusy, setLive, onRun, onChanged,
}: {
  detail: ClipDetail;
  live: Record<string, string[]>;
  busy: Record<string, boolean>;
  setBusy: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setLive: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  onRun: (key: string) => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const { project, err, notify, go } = useApp();
  const { clip } = detail;
  const steps = project?.config.steps ?? [];
  const rows = new Map(detail.steps.map((s) => [s.step_key, s]));
  const [selected, setSelected] = useState("");
  const renderer = project?.config.renderer ?? "remotion";
  const video = fileUrl(clip.video_path);

  useEffect(() => {
    if (selected || steps.length === 0) return;
    const first = steps.find((s) => !["done", "skipped"].includes(rows.get(s.key)?.status ?? "pending")) ?? steps[steps.length - 1];
    setSelected(first.key);
  }, [selected, steps]); // eslint-disable-line react-hooks/exhaustive-deps

  const def = steps.find((s) => s.key === selected) ?? steps[0];
  const row = rows.get(def?.key ?? "");
  const anyRunning = detail.steps.some((s) => s.status === "running");

  async function mark(key: string, status: "done" | "pending" | "review" | "skipped") {
    try {
      await api.setStepStatus(clip.id, key, status);
      await onChanged();
    } catch (e) {
      err(e);
    }
  }

  return (
    <div className="grid grid-cols-[1fr_260px] gap-4">
      <div className="grid min-w-0 gap-4 self-start">
        <GlassCard>
          <CardHeader className="pb-4">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>สร้างคลิปด้วย {rendererLabel[renderer]}</CardTitle>
                <Badge>{project?.config.width}×{project?.config.height}</Badge>
                <Badge>ไม่เกิน {project?.config.max_seconds} วิ</Badge>
              </div>
              <CardDesc className="mt-1">
                {renderer === "manual"
                  ? "ตัดต่อในโปรแกรมที่ถนัด แล้วแนบไฟล์วิดีโอที่ได้ ขั้นตอนตรวจไฟล์จะเช็กขนาด ความยาว และความดังให้"
                  : "ให้ flow ด้านล่างสร้างคลิปให้ (AI agent หรือกดทีละขั้นตอน) หรือเปิด studio เพื่อแก้คลิปเอง"}
              </CardDesc>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              {renderer !== "manual" && (
                <Button
                  variant="glass"
                  size="sm"
                  onClick={async () => {
                    try {
                      const cmd = await api.openStudio(project!.id);
                      notify(`เปิด studio แล้ว (${cmd})`);
                    } catch (e) {
                      err(e);
                    }
                  }}
                >
                  <Clapperboard /> เปิด studio
                </Button>
              )}
              <Button
                variant="glass"
                size="sm"
                title="ใช้ไฟล์วิดีโอที่ตัดต่อเองเป็นคลิปของโปรเจกต์นี้"
                onClick={async () => {
                  const [p] = await pickFiles([{ name: "วิดีโอ", extensions: ["mp4", "mov", "webm", "mkv"] }]);
                  if (!p) return;
                  try {
                    await api.updateClip(clip.id, { video_path: p });
                    await onChanged();
                    notify("แนบวิดีโอแล้ว รันขั้นตอน ตรวจไฟล์ ต่อได้");
                  } catch (e) {
                    err(e);
                  }
                }}
              >
                <Paperclip /> แนบวิดีโอ
              </Button>
              <Button variant="ghost" size="icon-sm" title="เปิดโฟลเดอร์งาน" onClick={() => project?.workdir && openPath(project.workdir).catch(err)}>
                <FolderOpen />
              </Button>
            </div>
          </CardHeader>
        </GlassCard>

        {project?.config.run_mode === "agent" && (
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
                await onChanged();
              }
            }}
            onCancel={() => api.cancelStep(clip.id, "__flow__").catch(err)}
          />
        )}

        {steps.length === 0 ? (
          <GlassCard>
            <Empty title="ช่องนี้ยังไม่มีขั้นตอน" desc="เพิ่มขั้นตอน (เขียนบท ทำเสียง เรนเดอร์ ตรวจไฟล์) ได้ที่ ตั้งค่าช่อง">
              <Button variant="glass" onClick={() => go("channel")}>ตั้งค่าช่อง</Button>
            </Empty>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-[230px_1fr] gap-4">
            <GlassCard className="self-start p-2">
              <ol className="relative grid">
                {steps.map((s, i) => {
                  const st = rows.get(s.key)?.status ?? "pending";
                  const active = s.key === def?.key;
                  return (
                    <li key={s.key} className="relative">
                      {i < steps.length - 1 && <span className="absolute bottom-[-6px] left-[19px] top-[34px] w-px bg-[var(--glass-hairline)]" />}
                      <button
                        onClick={() => setSelected(s.key)}
                        className={cn("soft relative flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-[var(--glass-bg-strong)]" : "hover:bg-[var(--glass-bg-subtle)]")}
                      >
                        <StepDot status={st} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{s.label}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{kindMeta[s.kind]?.label}{s.gate ? ", ต้องตรวจ" : ""}</span>
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
                <motion.div key={def.key} className="min-w-0" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                  <StepPanel
                    def={def}
                    row={row}
                    clip={clip}
                    live={live[def.key]}
                    busy={!!busy[def.key]}
                    otherRunning={anyRunning && row?.status !== "running"}
                    onRun={() => onRun(def.key)}
                    onCancel={async () => {
                      await api.cancelStep(clip.id, def.key);
                    }}
                    onMark={(s) => mark(def.key, s)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <GlassCard className="sticky top-0 self-start overflow-hidden">
        {video ? (
          <video src={video} controls className="aspect-[9/16] w-full bg-black/80 object-contain" poster={fileUrl(clip.cover_path)} />
        ) : (
          <div className="grid aspect-[9/16] place-items-center px-5 text-center text-sm text-muted-foreground">ยังไม่มีวิดีโอ จะแสดงหลังเรนเดอร์ หรือเมื่อแนบไฟล์</div>
        )}
        {clip.video_path && (
          <div className="flex items-center gap-1 px-2 py-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" title={clip.video_path}>{clip.video_path.split(/[\\/]/).pop()}</span>
            <Button variant="ghost" size="icon-sm" title="เปิดโฟลเดอร์" onClick={() => revealPath(clip.video_path!)}><FolderOpen /></Button>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

// ---------------------------------------------------------------- Affiliate
const socials: { id: SocialPlatform; label: string; upload: string }[] = [
  { id: "facebook", label: "Facebook", upload: "https://www.facebook.com/reels/create" },
  { id: "instagram", label: "Instagram", upload: "https://www.instagram.com/" },
  { id: "tiktok", label: "TikTok", upload: "https://www.tiktok.com/tiktokstudio/upload" },
  { id: "x", label: "X", upload: "https://x.com/compose/post" },
  { id: "youtube", label: "YouTube", upload: "https://studio.youtube.com/" },
];

function linkLine(l: AffiliateLink) {
  return `🛒 ${l.title || "สินค้า"}: ${l.url}`;
}

function AffiliateTab({ clip }: { clip: Clip }) {
  const { project, err, notify, go } = useApp();
  const [items, setItems] = useState<ClipAffiliate[]>([]);
  const [lib, setLib] = useState<AffiliateLink[]>([]);
  const [adding, setAdding] = useState(false);
  const [newLink, setNewLink] = useState(false);
  const load = useCallback(async () => {
    try {
      const [a, l] = await Promise.all([api.clipAffiliates(clip.id), api.affiliates(project?.id ?? null)]);
      setItems(a);
      setLib(l);
    } catch (e) {
      err(e);
    }
  }, [clip.id, project?.id, err]);
  useEffect(() => {
    void load();
  }, [load]);

  const attached = new Set(items.map((x) => x.link.id));
  const free = lib.filter((l) => !attached.has(l.id));

  async function setPlacement(it: ClipAffiliate, platform: SocialPlatform, on: boolean) {
    const cur = new Set(it.placement.split(",").map((s) => s.trim()).filter(Boolean));
    if (on) cur.add(platform);
    else cur.delete(platform);
    try {
      await api.attachAffiliate(clip.id, it.link.id, [...cur].join(","));
      await load();
    } catch (e) {
      err(e);
    }
  }

  return (
    <div className="grid grid-cols-[1fr_320px] gap-4">
      <GlassCard className="self-start">
        <CardHeader>
          <div>
            <CardTitle>ลิงก์ affiliate ของคลิปนี้</CardTitle>
            <CardDesc>เลือกว่าลิงก์ไหนไปแพลตฟอร์มไหน แท็บ Publish จะใส่ลิงก์ในแคปชันให้ตามนี้</CardDesc>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="glass" size="sm" onClick={() => setAdding(true)} disabled={free.length === 0} title={free.length === 0 ? "ลิงก์ในคลังถูกใช้ครบแล้ว" : undefined}><Library /> เลือกจากคลัง</Button>
            <Button size="sm" onClick={() => setNewLink(true)}><Plus /> ลิงก์ใหม่</Button>
          </div>
        </CardHeader>
        <CardBody className="pt-2">
          {items.length === 0 ? (
            <Empty icon={<Link2 />} title="ยังไม่มีลิงก์" desc="ใส่ลิงก์สินค้าจาก Shopee, Lazada, Amazon, G2A หรือร้านอื่น ลิงก์ใหม่จะถูกเก็บในคลังด้วย" />
          ) : (
            <div className="grid divide-y divide-[var(--glass-hairline)]">
              {items.map((it) => {
                const on = new Set(it.placement.split(",").map((s) => s.trim()));
                return (
                  <div key={it.link.id} className="grid gap-2 py-3">
                    <div className="flex items-center gap-3">
                      <ShopBadge id={it.link.platform} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{it.link.title || "(ไม่มีชื่อ)"}</span>
                        <span className="block truncate font-mono text-xs text-muted-foreground">{it.link.url}</span>
                      </span>
                      <Button variant="ghost" size="icon-sm" title="เปิดลิงก์" onClick={() => openUrl(it.link.url).catch(err)}><ExternalLink /></Button>
                      <Button
                        variant="destructive"
                        size="icon-sm"
                        title="เอาออกจากคลิปนี้"
                        onClick={async () => {
                          try {
                            await api.detachAffiliate(clip.id, it.link.id);
                            await load();
                          } catch (e) {
                            err(e);
                          }
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pl-1">
                      <span className="mr-1 text-xs text-muted-foreground">ใส่ใน</span>
                      {socials.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setPlacement(it, s.id, !on.has(s.id))}
                          aria-pressed={on.has(s.id)}
                          className={cn("soft h-7 rounded-full border px-3 text-xs font-medium", on.has(s.id) ? "border-transparent bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                    {it.link.note && <p className="pl-1 text-xs text-muted-foreground">{it.link.note}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </GlassCard>

      <GlassCard className="self-start">
        <CardHeader>
          <div>
            <CardTitle>ข้อความลิงก์</CardTitle>
            <CardDesc>ต่อท้ายแคปชันได้เลย</CardDesc>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            title="คัดลอก"
            disabled={items.length === 0}
            onClick={async () => {
              await navigator.clipboard.writeText(items.map((x) => linkLine(x.link)).join("\n"));
              notify("คัดลอกแล้ว");
            }}
          >
            <Copy />
          </Button>
        </CardHeader>
        <CardBody>
          <pre className="console glass-subtle min-h-20 whitespace-pre-wrap break-all rounded-md p-3 text-[12px]">{items.length ? items.map((x) => linkLine(x.link)).join("\n") : "–"}</pre>
          <Button variant="ghost" size="sm" className="mt-2 text-muted-foreground" onClick={() => go("affiliates")}>จัดการคลังลิงก์ทั้งหมด</Button>
        </CardBody>
      </GlassCard>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogTitle>เลือกลิงก์จากคลัง</DialogTitle>
          <div className="grid max-h-[50vh] gap-1 overflow-auto">
            {free.map((l) => (
              <button
                key={l.id}
                className="soft flex items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-[var(--glass-bg-subtle)]"
                onClick={async () => {
                  try {
                    await api.attachAffiliate(clip.id, l.id, "facebook");
                    await load();
                    notify(`เพิ่ม ${l.title || "ลิงก์"} แล้ว`);
                  } catch (e) {
                    err(e);
                  }
                }}
              >
                <ShopBadge id={l.platform} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{l.title || "(ไม่มีชื่อ)"}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">{l.url}</span>
                </span>
                <Plus className="size-4 text-muted-foreground" />
              </button>
            ))}
            {free.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">ใช้ครบทุกลิงก์แล้ว</p>}
          </div>
          <div className="flex justify-end"><Button variant="glass" onClick={() => setAdding(false)}>เสร็จ</Button></div>
        </DialogContent>
      </Dialog>

      <LinkDialog
        open={newLink}
        link={null}
        channelId={project?.id ?? null}
        onClose={() => setNewLink(false)}
        onSaved={async (l) => {
          try {
            await api.attachAffiliate(clip.id, l.id, "facebook");
            await load();
          } catch (e) {
            err(e);
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- Publish
function PublishTab({ clip, posts, onChanged, onRunCaptionStep, captionRunning }: { clip: Clip; posts: Post[]; onChanged: () => Promise<void>; onRunCaptionStep: () => void; captionRunning: boolean }) {
  const { project, err, notify } = useApp();
  const [caption, setCaption] = useState(clip.caption);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [links, setLinks] = useState<ClipAffiliate[]>([]);
  const [connect, setConnect] = useState<{ account: SocialAccount | null; platform: SocialPlatform } | null>(null);
  const [record, setRecord] = useState<SocialPlatform | null>(null);
  const [writing, setWriting] = useState(false);
  useEffect(() => setCaption(clip.caption), [clip.id, clip.caption]);
  const captionStep = project?.config.steps.find((s) => s.key === "caption" && s.kind === "ai");

  const load = useCallback(async () => {
    try {
      const [a, l] = await Promise.all([api.accounts(project?.id ?? null), api.clipAffiliates(clip.id)]);
      setAccounts(a);
      setLinks(l);
    } catch (e) {
      err(e);
    }
  }, [project?.id, clip.id, err]);
  useEffect(() => {
    void load();
  }, [load]);

  const captionFor = (p: SocialPlatform) => {
    const l = links.filter((x) => x.placement.split(",").map((s) => s.trim()).includes(p)).map((x) => linkLine(x.link));
    return [caption.trim(), l.join("\n")].filter(Boolean).join("\n\n");
  };

  async function prepare(p: (typeof socials)[number]) {
    try {
      await navigator.clipboard.writeText(captionFor(p.id));
      if (clip.video_path) await revealPath(clip.video_path);
      await openUrl(p.upload);
      notify(`คัดลอกแคปชันสำหรับ ${p.label} แล้ว${clip.video_path ? " เปิดโฟลเดอร์วิดีโอ" : ""} และเปิดหน้าอัปโหลด\nโพสต์เสร็จแล้วกด “บันทึกโพสต์”`, "info");
    } catch (e) {
      err(e);
    }
  }

  async function aiCaption() {
    if (captionStep) {
      onRunCaptionStep();
      return;
    }
    setWriting(true);
    try {
      setCaption(await api.aiWrite(`เขียนแคปชันโพสต์ภาษาไทยสำหรับคลิปสั้น "${clip.title}" ช่อง ${project?.name}\nเรื่อง: ${clip.brief}\nบท: ${scriptText(clip)}\n\nมีคำถามชวนคอมเมนต์ 1 ประโยค และแฮชแท็ก 4-6 อัน ตอบเฉพาะแคปชัน`));
    } catch (e) {
      err(e);
    } finally {
      setWriting(false);
    }
  }

  return (
    <div className="grid grid-cols-[1fr_380px] gap-4">
      <div className="grid gap-4 self-start">
        <GlassCard>
          <CardHeader>
            <div>
              <CardTitle>แคปชัน</CardTitle>
              <CardDesc>ลิงก์ affiliate ถูกต่อท้ายตามแพลตฟอร์มที่เลือกในแท็บ Affiliate</CardDesc>
            </div>
            <Button variant="glass" size="sm" onClick={aiCaption} disabled={writing || captionRunning}>
              <Sparkles className={cn((writing || captionRunning) && "animate-pulse")} /> {writing || captionRunning ? "AI กำลังเขียน…" : "AI เขียนแคปชัน"}
            </Button>
          </CardHeader>
          <CardBody className="grid gap-3">
            <Textarea rows={8} value={caption} onChange={(e) => setCaption(e.target.value)} />
            <div>
              <Button
                disabled={caption === clip.caption}
                onClick={async () => {
                  try {
                    await api.updateClip(clip.id, { caption });
                    await onChanged();
                    notify("บันทึกแคปชันแล้ว");
                  } catch (e) {
                    err(e);
                  }
                }}
              >
                <Save /> บันทึกแคปชัน
              </Button>
            </div>
          </CardBody>
        </GlassCard>

        <GlassCard>
          <CardHeader>
            <div>
              <CardTitle>โพสต์ลงโซเชียล</CardTitle>
              <CardDesc>กด เตรียมโพสต์ = คัดลอกแคปชันของแพลตฟอร์มนั้น เปิดโฟลเดอร์วิดีโอ และเปิดหน้าอัปโหลด (MumuCut ยังไม่โพสต์ผ่าน API เอง)</CardDesc>
            </div>
          </CardHeader>
          <CardBody className="grid gap-2">
            {socials.map((p) => {
              const acc = accounts.filter((a) => a.platform === p.id);
              const done = posts.find((x) => x.platform === p.id && x.status !== "cancelled");
              return (
                <div key={p.id} className="glass-subtle flex items-center gap-3 rounded-md px-3.5 py-2.5">
                  <PlatformIcon id={p.id} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {p.label}
                      {done && <Badge tone={done.status === "posted" ? "success" : "info"}>{done.status === "posted" ? "โพสต์แล้ว" : "ตั้งเวลาแล้ว"}</Badge>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {acc.length ? acc.map((a) => a.name || a.handle).join(", ") : "ยังไม่ได้เชื่อมต่อบัญชี"}
                    </div>
                  </div>
                  {acc.length === 0 ? (
                    <Button variant="glass" size="sm" onClick={() => setConnect({ account: null, platform: p.id })}><Plus /> เชื่อมต่อ</Button>
                  ) : (
                    <>
                      <Button variant="glass" size="sm" onClick={() => prepare(p)} disabled={!!done}><Upload /> เตรียมโพสต์</Button>
                      <Button size="sm" variant={done ? "glass" : "default"} onClick={() => setRecord(p.id)} disabled={!!done}><CalendarClock /> บันทึกโพสต์</Button>
                    </>
                  )}
                </div>
              );
            })}
          </CardBody>
        </GlassCard>

        <PostList posts={posts} onChanged={onChanged} />
      </div>

      <GlassCard className="self-start">
        <CardHeader>
          <div>
            <CardTitle>บัญชีของช่อง {project?.name}</CardTitle>
            <CardDesc>บัญชีที่ใช้โพสต์ ใช้กับทุกโปรเจกต์ในช่องนี้</CardDesc>
          </div>
        </CardHeader>
        <CardBody className="grid gap-1.5">
          {accounts.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">ยังไม่มีบัญชี</p>}
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-md px-1 py-1.5">
              <PlatformIcon id={a.platform} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{a.name || a.handle}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {a.handle || a.url || socials.find((s) => s.id === a.platform)?.label}
                  {a.has_token && " · มีโทเคน"}
                </span>
              </span>
              {a.url && <Button variant="ghost" size="icon-sm" title="เปิดหน้าบัญชี" onClick={() => openUrl(a.url).catch(err)}><ExternalLink /></Button>}
              <Button variant="ghost" size="sm" onClick={() => setConnect({ account: a, platform: a.platform })}>แก้ไข</Button>
            </div>
          ))}
          <Button variant="glass" className="mt-2" onClick={() => setConnect({ account: null, platform: "facebook" })}><Plus /> เชื่อมต่อบัญชี</Button>
        </CardBody>
      </GlassCard>

      <ConnectDialog state={connect} onClose={() => setConnect(null)} onSaved={() => void load()} />
      <RecordDialog clip={clip} platform={record} onClose={() => setRecord(null)} onSaved={onChanged} />
    </div>
  );
}

function PlatformIcon({ id }: { id: SocialPlatform }) {
  const m: Record<SocialPlatform, { bg: string; t: string }> = {
    facebook: { bg: "#1877F2", t: "f" },
    instagram: { bg: "linear-gradient(135deg,#F58529,#DD2A7B,#8134AF)", t: "IG" },
    tiktok: { bg: "#111", t: "TT" },
    x: { bg: "#000", t: "X" },
    youtube: { bg: "#FF0000", t: "▶" },
  };
  const s = m[id];
  return (
    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md text-[12px] font-bold text-white" style={{ background: s.bg }}>
      {s.t}
    </span>
  );
}

function ConnectDialog({ state, onClose, onSaved }: { state: { account: SocialAccount | null; platform: SocialPlatform } | null; onClose: () => void; onSaved: () => void }) {
  const { project, err, notify, confirm } = useApp();
  const blank = (p: SocialPlatform): SocialAccount => ({ id: 0, channel_id: project?.id ?? null, platform: p, name: "", handle: "", url: "", created_at: "", has_token: false });
  const [a, setA] = useState<SocialAccount>(blank("facebook"));
  const [token, setToken] = useState("");
  useEffect(() => {
    if (state) {
      setA(state.account ?? blank(state.platform));
      setToken("");
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <div>
          <DialogTitle>{a.id ? "แก้ไขบัญชี" : "เชื่อมต่อบัญชีโซเชียล"}</DialogTitle>
          <DialogDescription>บันทึกบัญชีที่ช่องนี้ใช้โพสต์ โทเคนเก็บใน Windows Credential Manager ไม่อยู่ในฐานข้อมูล</DialogDescription>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {socials.map((s) => (
            <button
              key={s.id}
              onClick={() => setA({ ...a, platform: s.id })}
              aria-pressed={a.platform === s.id}
              className={cn("soft flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-xs font-medium", a.platform === s.id ? "bg-[var(--glass-bg-strong)] ring-1 ring-ring" : "hover:bg-[var(--glass-bg-subtle)]")}
            >
              <PlatformIcon id={s.id} />
              {s.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="ชื่อเพจ/ช่อง"><Input value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} /></Field>
          <Field label="ชื่อผู้ใช้ (@)"><Input value={a.handle} onChange={(e) => setA({ ...a, handle: e.target.value })} placeholder="@" /></Field>
        </div>
        <Field label="ลิงก์หน้าบัญชี"><Input value={a.url} onChange={(e) => setA({ ...a, url: e.target.value })} placeholder="https://" className="font-mono text-[13px]" /></Field>
        <Field label={a.has_token ? "Access token (มีอยู่แล้ว ใส่ใหม่เพื่อแทนที่)" : "Access token (ไม่บังคับ)"} hint="เก็บไว้สำหรับการโพสต์ผ่าน API ในเวอร์ชันถัดไป ตอนนี้ยังไม่ถูกใช้">
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} className="pl-9" autoComplete="off" />
          </div>
        </Field>
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={a.channel_id == null} onCheckedChange={(v) => setA({ ...a, channel_id: v ? null : project?.id ?? null })} />
          ใช้บัญชีนี้กับทุกช่อง
        </label>
        <div className="flex justify-between gap-2">
          <div>
            {a.id > 0 && (
              <Button
                variant="destructive"
                onClick={async () => {
                  const ok = await confirm({
                    title: `ลบบัญชี ${a.name || a.handle}?`,
                    desc: "เอาบัญชีนี้ออกจาก MumuCut และลบโทเคนที่เก็บไว้ บัญชีจริงบนแพลตฟอร์มไม่ถูกแตะ",
                    confirmLabel: "ลบบัญชี",
                  });
                  if (!ok) return;
                  try {
                    await api.deleteAccount(a.id);
                    onSaved();
                    onClose();
                  } catch (e) {
                    err(e);
                  }
                }}
              >
                <Trash2 /> ลบบัญชี
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
            <Button
              onClick={async () => {
                try {
                  const saved = await api.saveAccount(a);
                  if (token.trim()) await api.setAccountToken(saved.id, token);
                  onSaved();
                  onClose();
                  notify(`บันทึกบัญชี ${saved.name || saved.handle} แล้ว`);
                } catch (e) {
                  err(e);
                }
              }}
            >
              บันทึก
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RecordDialog({ clip, platform, onClose, onSaved }: { clip: Clip; platform: SocialPlatform | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { err, notify } = useApp();
  const [when, setWhen] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const label = socials.find((s) => s.id === platform)?.label;
  return (
    <Dialog open={!!platform} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <div>
          <DialogTitle>บันทึกโพสต์ {label}</DialogTitle>
          <DialogDescription>กันโพสต์ซ้ำ: คลิปเดียวกันบนแพลตฟอร์มเดียวกันบันทึกได้ครั้งเดียว</DialogDescription>
        </div>
        <Field label="เวลาโพสต์ (หรือเวลาที่ตั้งไว้)"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
        <Field label="ลิงก์โพสต์"><Input placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
        <Field label="หมายเหตุ"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button
            onClick={async () => {
              try {
                await api.addPost(clip.id, platform!, when.replace("T", " "), url, note);
                setUrl("");
                setNote("");
                setWhen("");
                await onSaved();
                onClose();
                notify("บันทึกโพสต์แล้ว");
              } catch (e) {
                err(e);
              }
            }}
          >
            <Check /> บันทึก
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PostList({ posts, onChanged }: { posts: Post[]; onChanged: () => Promise<void> }) {
  const { err, confirm } = useApp();
  if (posts.length === 0) return null;
  const label = (p: string) => socials.find((x) => x.id === p)?.label ?? p;
  return (
    <GlassCard>
      <CardHeader><CardTitle>ประวัติโพสต์</CardTitle></CardHeader>
      <CardBody className="pt-2">
        <div className="grid divide-y divide-[var(--glass-hairline)]">
          {posts.map((p) => (
            <div key={p.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {label(p.platform)}
                  <Badge tone={p.status === "posted" ? "success" : p.status === "cancelled" ? "neutral" : "info"}>{p.status === "posted" ? "โพสต์แล้ว" : p.status === "cancelled" ? "ยกเลิก" : "ตั้งเวลา"}</Badge>
                </div>
                <div className="truncate text-xs text-muted-foreground">{p.scheduled_at || "ไม่ระบุเวลา"}{p.url ? `, ${p.url}` : ""}</div>
              </div>
              {p.url && <Button variant="ghost" size="icon-sm" title="เปิดโพสต์" onClick={() => openUrl(p.url).catch(err)}><ExternalLink /></Button>}
              {p.status === "scheduled" && (
                <Button variant="glass" size="sm" onClick={async () => { try { await api.updatePost(p.id, "posted"); await onChanged(); } catch (e) { err(e); } }}>
                  <Check /> โพสต์แล้ว
                </Button>
              )}
              {p.status !== "cancelled" && p.status !== "posted" && (
                <Button variant="ghost" size="sm" onClick={async () => { try { await api.updatePost(p.id, "cancelled"); await onChanged(); } catch (e) { err(e); } }}>ยกเลิก</Button>
              )}
              <Button variant="destructive" size="icon-sm" title="ลบรายการ" onClick={async () => {
                  const ok = await confirm({ title: `ลบประวัติโพสต์ ${label(p.platform)}?`, desc: "ลบเฉพาะรายการในโปรแกรม โพสต์จริงบนแพลตฟอร์มไม่ถูกลบ\nเมื่อลบแล้ว ระบบกันโพสต์ซ้ำจะไม่รู้ว่าคลิปนี้เคยลงแพลตฟอร์มนี้", confirmLabel: "ลบรายการ" });
                  if (!ok) return;
                  try { await api.deletePost(p.id); await onChanged(); } catch (e) { err(e); }
                }}><Trash2 /></Button>
            </div>
          ))}
        </div>
      </CardBody>
    </GlassCard>
  );
}
