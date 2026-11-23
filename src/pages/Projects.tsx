import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { FolderKanban, Plus, Search, Sparkles } from "lucide-react";
import { useApp } from "@/lib/store";
import { api, fileUrl } from "@/lib/api";
import type { Clip, ClipStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ChannelAvatar, ClipStatusBadge, Empty, Skeleton } from "@/components/common";
import { cn, fmtDuration, fmtTime } from "@/lib/utils";

const filters: { id: string; label: string; dot: string; match: (s: ClipStatus) => boolean }[] = [
  { id: "all", label: "ทั้งหมด", dot: "bg-foreground/40", match: () => true },
  { id: "doing", label: "กำลังทำ", dot: "bg-info", match: (s) => s === "draft" || s === "making" || s === "blocked" },
  { id: "ready", label: "พร้อมโพสต์", dot: "bg-success", match: (s) => s === "ready" },
  { id: "scheduled", label: "ตั้งเวลาแล้ว", dot: "bg-info/60", match: (s) => s === "scheduled" },
  { id: "posted", label: "โพสต์แล้ว", dot: "bg-foreground/25", match: (s) => s === "posted" },
  { id: "hold", label: "พักไว้", dot: "bg-warning", match: (s) => s === "hold" },
];

/** The topic of a clip in one line: its brief, else its reference. */
export function clipTopic(c: Clip) {
  const b = c.brief.split("\n").map((s) => s.trim()).find(Boolean);
  return b || c.ref || "";
}

export default function ProjectsPage() {
  const { clips, loading, project, openClip } = useApp();
  const [f, setF] = useState("all");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const total = project?.config.steps.length ?? 0;

  const list = useMemo(() => {
    const flt = filters.find((x) => x.id === f)!;
    const s = q.trim().toLowerCase();
    return clips
      .filter((c) => flt.match(c.status))
      .filter((c) => !s || [c.clip_key, c.title, c.ref, c.brief].some((t) => t.toLowerCase().includes(s)))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }, [clips, f, q]);

  return (
    <div>
      <div className="flex items-end justify-between gap-4 pb-5">
        <div className="flex items-center gap-3">
          {project && <ChannelAvatar name={project.name} />}
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight">Projects</h1>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
              {project?.config.description || `โปรเจกต์คลิปของช่อง ${project?.name ?? ""} หนึ่งโปรเจกต์ = หนึ่งคลิป`}
            </p>
          </div>
        </div>
        <Button onClick={() => setCreating(true)} disabled={!project}>
          <Plus /> โปรเจกต์ใหม่
        </Button>
      </div>

      <div className="grid grid-cols-6 gap-3 pb-3.5" role="tablist" aria-label="กรองตามสถานะ">
        {filters.map((k, i) => {
          const n = clips.filter((c) => k.match(c.status)).length;
          const active = f === k.id;
          return (
            <motion.button
              key={k.id}
              role="tab"
              aria-selected={active}
              title={active && k.id !== "all" ? "กดอีกครั้งเพื่อดูทั้งหมด" : `ดูเฉพาะ ${k.label}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              onClick={() => setF(active ? "all" : k.id)}
              className={cn(
                "soft glass rounded-lg px-4 py-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "bg-[var(--glass-bg-strong)] ring-2 ring-foreground/55" : "hover:bg-[var(--glass-bg-strong)]",
              )}
            >
              <div className={cn("text-[28px] font-semibold leading-none tracking-tight tabular-nums", n === 0 && "text-muted-foreground/60")}>{n}</div>
              <div className={cn("mt-1.5 flex items-center gap-1.5 text-[13px]", active ? "font-medium text-foreground" : "text-muted-foreground")}>
                <span className={cn("size-2 rounded-full", k.dot)} />
                {k.label}
              </div>
            </motion.button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 pb-3.5">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหารหัส ชื่อคลิป หรือเรื่องที่เล่า" className="pl-9" aria-label="ค้นหาโปรเจกต์" />
        </div>
        <span className="text-[13px] text-muted-foreground">
          {f !== "all" || q.trim() ? `พบ ${list.length} จาก ${clips.length} โปรเจกต์` : `${clips.length} โปรเจกต์`}
        </span>
        {(f !== "all" || q.trim()) && (
          <Button variant="ghost" size="sm" onClick={() => { setF("all"); setQ(""); }}>
            ล้างตัวกรอง
          </Button>
        )}
      </div>

      <GlassCard className="overflow-hidden">
        {loading ? (
          <div className="grid gap-3 p-5" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <Empty
            icon={<FolderKanban />}
            title={clips.length === 0 ? "ยังไม่มีโปรเจกต์คลิปในช่องนี้" : "ไม่พบโปรเจกต์ที่ตรงกับตัวกรอง"}
            desc={clips.length === 0 ? "เริ่มจากบอกว่าคลิปแรกจะเล่าเรื่องอะไร แล้วไปต่อที่ Scripts" : undefined}
          >
            {clips.length === 0 && (
              <Button onClick={() => setCreating(true)}>
                <Plus /> สร้างโปรเจกต์แรก
              </Button>
            )}
          </Empty>
        ) : (
          <div className="grid divide-y divide-[var(--glass-hairline)]">
            <div className="grid grid-cols-[44px_72px_1fr_170px_120px_92px] gap-3 px-5 py-2.5 text-xs font-medium text-muted-foreground">
              <span />
              <span>รหัส</span>
              <span>คลิปนี้เล่าเรื่องอะไร</span>
              <span>ความคืบหน้า</span>
              <span>สถานะ</span>
              <span className="text-right">อัปเดต</span>
            </div>
            {list.map((c, i) => {
              const cover = fileUrl(c.cover_path);
              const topic = clipTopic(c);
              return (
                <motion.button
                  key={c.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 8) * 0.03 }}
                  onClick={() => openClip(c.id)}
                  className="soft grid grid-cols-[44px_72px_1fr_170px_120px_92px] items-center gap-3 px-5 py-2.5 text-left outline-none hover:bg-[var(--glass-bg-subtle)] focus-visible:bg-[var(--glass-bg-subtle)]"
                >
                  <span className="grid aspect-[9/16] w-9 place-items-center overflow-hidden rounded-[5px] bg-[linear-gradient(160deg,var(--muted),transparent)]">
                    {cover ? <img src={cover} alt="" className="size-full object-cover" loading="lazy" /> : <FolderKanban className="size-3.5 text-muted-foreground/60" />}
                  </span>
                  <span className="font-mono text-[13px] font-medium">{c.clip_key}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{c.title || <span className="text-muted-foreground">(ยังไม่มีชื่อ)</span>}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {topic || "ยังไม่ได้ใส่เรื่องของคลิป"}
                      {c.duration != null && ` · ${fmtDuration(c.duration)}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Progress value={(c.done_steps / Math.max(1, total)) * 100} />
                    <span className="w-9 text-right text-xs text-muted-foreground">{c.done_steps}/{total}</span>
                  </span>
                  <ClipStatusBadge status={c.status} />
                  <span className="text-right text-xs text-muted-foreground">{fmtTime(c.updated_at).slice(5)}</span>
                </motion.button>
              );
            })}
          </div>
        )}
      </GlassCard>

      <NewProjectDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { project, clips, refresh, openClip, err, notify } = useApp();
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const usesPool = !!project?.config.pool.csv;

  async function suggest() {
    if (!project) return;
    setThinking(true);
    try {
      const recent = clips.slice(0, 15).map((c) => `- ${c.title || c.ref}`).filter((s) => s.length > 2).join("\n");
      const ans = await api.aiWrite(
        `ช่อง "${project.name}": ${project.config.description || "(ไม่มีคำอธิบาย)"}\nคลิปที่ทำไปแล้ว:\n${recent || "- (ยังไม่มี)"}\n\nเสนอหัวข้อคลิปถัดไป 1 เรื่องที่ไม่ซ้ำ ตอบเป็น JSON อย่างเดียว: {"title":"ชื่อคลิปสั้น ๆ","brief":"คลิปนี้เล่าเรื่องอะไร 2-3 ประโยค"}`,
      );
      const m = ans.match(/\{[\s\S]*\}/);
      const j = m ? JSON.parse(m[0]) : null;
      if (j?.title) setTitle(String(j.title));
      setBrief(j?.brief ? String(j.brief) : ans);
    } catch (e) {
      err(e);
    } finally {
      setThinking(false);
    }
  }

  async function create() {
    if (!project) return;
    setBusy(true);
    try {
      const c = await api.createClip(project.id);
      if (title.trim() || brief.trim()) await api.updateClip(c.id, { title: title.trim(), brief: brief.trim() });
      await refresh();
      onOpenChange(false);
      setTitle("");
      setBrief("");
      openClip(c.id, "scripts");
      notify(`สร้างโปรเจกต์ ${c.clip_key} แล้ว`);
    } catch (e) {
      err(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div>
          <DialogTitle>โปรเจกต์คลิปใหม่</DialogTitle>
          <DialogDescription>
            ช่อง {project?.name} · {usesPool ? "เว้นว่างได้ ขั้นตอน เลือกหัวข้อ จะหยิบจากคลังหัวข้อของช่องให้" : "บอกสั้น ๆ ว่าคลิปนี้เล่าเรื่องอะไร"}
          </DialogDescription>
        </div>
        <Field label="ชื่อคลิป">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น ถูกคลื่นดูด ทำยังไง" />
        </Field>
        <Field label="คลิปนี้เล่าเรื่องอะไร" hint="ส่งให้ AI เป็นโจทย์ตอนเขียนบท ({brief})">
          <Textarea rows={4} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="ประเด็นหลัก กลุ่มคนดู แหล่งข้อมูล หรือมุกที่อยากได้" />
        </Field>
        <div className="flex items-center justify-between gap-2">
          <Button variant="glass" onClick={suggest} disabled={thinking || !project}>
            <Sparkles className={cn(thinking && "animate-pulse")} /> {thinking ? "AI กำลังคิด…" : "AI ช่วยคิดหัวข้อ"}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
            <Button onClick={create} disabled={busy}>
              <Plus /> สร้างโปรเจกต์
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
