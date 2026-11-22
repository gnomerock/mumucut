import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { FolderOpen, Library as LibraryIcon, PauseCircle, PlayCircle } from "lucide-react";
import { useApp } from "@/lib/store";
import { api, fileUrl, revealPath } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/card";
import { ClipStatusBadge, Empty, PageHeader, clipStatusMeta } from "@/components/common";
import { cn, fmtDuration } from "@/lib/utils";
import type { Clip, ClipStatus } from "@/lib/types";

const filters: (ClipStatus | "all")[] = ["all", "ready", "scheduled", "posted", "hold"];

export default function LibraryPage() {
  const { clips, openClip, refresh, err, notify, stats } = useApp();
  const [f, setF] = useState<ClipStatus | "all">("all");
  const done = useMemo(() => clips.filter((c) => ["ready", "scheduled", "posted", "hold"].includes(c.status)), [clips]);
  const list = f === "all" ? done : done.filter((c) => c.status === f);

  async function toggleHold(c: Clip) {
    try {
      const next: ClipStatus = c.status === "hold" ? "ready" : "hold";
      await api.updateClip(c.id, { status: next });
      await refresh();
      notify(next === "hold" ? `พัก ${c.clip_key} ไว้แล้ว (จะไม่ถูกโพสต์)` : `${c.clip_key} กลับเป็นพร้อมโพสต์`);
    } catch (e) {
      err(e);
    }
  }

  return (
    <div>
      <PageHeader title="คลัง" desc="คลิปที่ทำเสร็จแล้ว — ตรวจสถานะ พักไว้ หรือเปิดโฟลเดอร์ไฟล์">
        <div className="glass-subtle flex rounded-md p-0.5">
          {filters.map((k) => (
            <button
              key={k}
              onClick={() => setF(k)}
              className={cn(
                "soft h-8 rounded-sm px-3 text-[13px] font-medium",
                f === k ? "bg-[var(--glass-bg-strong)] text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k === "all" ? "ทั้งหมด" : clipStatusMeta[k].label}
              <span className="ml-1.5 text-xs opacity-60">{k === "all" ? done.length : stats?.by_status?.[k] ?? 0}</span>
            </button>
          ))}
        </div>
      </PageHeader>

      {list.length === 0 ? (
        <GlassCard>
          <Empty icon={<LibraryIcon />} title="ยังไม่มีคลิปในคลัง" desc="คลิปจะมาอยู่ที่นี่หลังขั้นตอน “ลงคลัง” หรือนำเข้าจากโฟลเดอร์คลังเดิมในหน้าโปรเจกต์" />
        </GlassCard>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3.5">
          {list.map((c, i) => {
            const cover = fileUrl(c.cover_path);
            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 10) * 0.03, duration: 0.3 }}
              >
                <GlassCard className="group overflow-hidden">
                  <button onClick={() => openClip(c.id)} className="block w-full text-left">
                    <div className="relative aspect-[9/12] w-full overflow-hidden bg-[linear-gradient(160deg,var(--muted),transparent)]">
                      {cover ? (
                        <img src={cover} alt={c.title} className="size-full object-cover transition-transform duration-500 ease-[var(--ease-soft)] group-hover:scale-[1.025]" loading="lazy" />
                      ) : (
                        <div className="grid size-full place-items-center font-mono text-2xl font-semibold text-muted-foreground/50">{c.clip_key}</div>
                      )}
                      <div className="absolute bottom-2.5 left-2.5">
                        <ClipStatusBadge status={c.status} />
                      </div>
                    </div>
                    <div className="grid gap-0.5 px-3.5 pb-2 pt-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{c.clip_key}</span>
                        <span className="text-xs text-muted-foreground">{fmtDuration(c.duration)}</span>
                      </div>
                      <div className="truncate text-sm font-medium">{c.title || "(ยังไม่มีชื่อ)"}</div>
                      <div className="truncate text-xs text-muted-foreground">{c.ref || "–"}</div>
                    </div>
                  </button>
                  <div className="flex items-center justify-between gap-1 px-2 pb-2">
                    <Button variant="ghost" size="sm" onClick={() => toggleHold(c)} disabled={c.status === "posted"}>
                      {c.status === "hold" ? <PlayCircle /> : <PauseCircle />}
                      {c.status === "hold" ? "ปล่อย" : "พัก"}
                    </Button>
                    {c.video_path && (
                      <Button variant="ghost" size="icon-sm" title="เปิดโฟลเดอร์" onClick={() => revealPath(c.video_path!)}>
                        <FolderOpen />
                      </Button>
                    )}
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
