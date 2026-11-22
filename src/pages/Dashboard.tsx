import { motion } from "motion/react";
import { ArrowRight, Plus } from "lucide-react";
import { useApp } from "@/lib/store";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CardBody, CardDesc, CardHeader, CardTitle, GlassCard } from "@/components/ui/card";
import { ClipStatusBadge, Empty, PageHeader, clipStatusMeta } from "@/components/common";
import { Progress } from "@/components/ui/progress";
import type { ClipStatus } from "@/lib/types";
import { fmtTime } from "@/lib/utils";

const order: ClipStatus[] = ["draft", "making", "ready", "scheduled", "posted", "hold"];

export default function Dashboard() {
  const { stats, clips, project, go, openClip, refresh, err, projects } = useApp();
  const steps = project?.config.steps ?? [];
  const recent = [...clips].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 6);

  async function newClip() {
    if (!project) return go("projects");
    try {
      const c = await api.createClip(project.id);
      await refresh();
      go("clips");
      openClip(c.id);
    } catch (e) {
      err(e);
    }
  }

  return (
    <div>
      <PageHeader title="ภาพรวม" desc={project ? `โปรเจกต์: ${project.name}` : "เริ่มจากสร้างโปรเจกต์"}>
        <Button onClick={newClip}>
          <Plus /> ทำคลิปใหม่
        </Button>
      </PageHeader>

      {projects.length === 0 ? (
        <GlassCard>
          <Empty title="ยังไม่มีโปรเจกต์" desc="สร้างโปรเจกต์จากแม่แบบ flow ธรรมะผู้สูงอายุ หรือเริ่มจากแม่แบบว่าง">
            <Button onClick={() => go("projects")}>ไปที่โปรเจกต์ <ArrowRight /></Button>
          </Empty>
        </GlassCard>
      ) : (
        <div className="grid gap-4">
          <div className="grid grid-cols-6 gap-3">
            {order.map((s, i) => (
              <motion.div key={s} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.3 }}>
                <GlassCard className="px-4 py-3.5">
                  <div className="text-[28px] font-semibold leading-none tracking-tight">{stats?.by_status?.[s] ?? 0}</div>
                  <div className="mt-1.5 text-[13px] text-muted-foreground">{clipStatusMeta[s].label}</div>
                </GlassCard>
              </motion.div>
            ))}
          </div>

          <GlassCard>
            <CardHeader>
              <div>
                <CardTitle>ลำดับงาน (flow)</CardTitle>
                <CardDesc>{steps.length} ขั้นตอนต่อคลิป — AI เขียนบท/ออกแบบ, สคริปต์ทำเสียง ภาพ เรนเดอร์, คนตรวจก่อนไปต่อ</CardDesc>
              </div>
            </CardHeader>
            <CardBody>
              <div className="flex flex-wrap items-center gap-y-2">
                {steps.map((s, i) => (
                  <div key={s.key} className="flex items-center">
                    <div className="glass-subtle flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[13px]">
                      <span className="grid size-5 place-items-center rounded-full bg-foreground/10 text-[11px] font-semibold">{i + 1}</span>
                      {s.label}
                      {s.kind === "ai" && <span className="text-[10px] font-semibold uppercase text-rose">AI</span>}
                      {s.gate && <span className="text-[10px] text-warning">ตรวจ</span>}
                    </div>
                    {i < steps.length - 1 && <ArrowRight className="mx-1 size-3.5 text-muted-foreground/60" />}
                  </div>
                ))}
              </div>
            </CardBody>
          </GlassCard>

          <GlassCard>
            <CardHeader>
              <div>
                <CardTitle>ล่าสุด</CardTitle>
                <CardDesc>คลิปที่แก้ไขหรือรันล่าสุด</CardDesc>
              </div>
              <Button variant="ghost" size="sm" onClick={() => go("clips")}>
                ดูทั้งหมด <ArrowRight />
              </Button>
            </CardHeader>
            <CardBody className="pt-1">
              {recent.length === 0 ? (
                <Empty title="ยังไม่มีคลิป" desc="กด “ทำคลิปใหม่” เพื่อเริ่ม flow หรือไปหน้าโปรเจกต์เพื่อนำเข้าคลิปที่มีอยู่ในคลัง" />
              ) : (
                <div className="grid">
                  {recent.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        go(c.status === "draft" || c.status === "making" ? "clips" : "library");
                        openClip(c.id);
                      }}
                      className="soft grid grid-cols-[72px_1fr_160px_210px] items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-[var(--glass-bg-subtle)]"
                    >
                      <span className="font-mono text-[13px] text-muted-foreground">{c.clip_key}</span>
                      <span className="truncate text-sm font-medium">{c.title || <span className="text-muted-foreground">(ยังไม่มีชื่อ)</span>}</span>
                      <div className="flex items-center gap-2">
                        <Progress value={(c.done_steps / Math.max(1, steps.length)) * 100} />
                        <span className="w-9 text-right text-xs text-muted-foreground">{c.done_steps}/{steps.length}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <ClipStatusBadge status={c.status} />
                        <span className="whitespace-nowrap text-xs text-muted-foreground">{fmtTime(c.updated_at).slice(5)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardBody>
          </GlassCard>
        </div>
      )}
    </div>
  );
}

