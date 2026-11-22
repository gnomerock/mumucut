import { motion } from "motion/react";
import { Clapperboard, Plus } from "lucide-react";
import { useApp } from "@/lib/store";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ClipStatusBadge, Empty, PageHeader } from "@/components/common";
import { fmtTime } from "@/lib/utils";

export default function Clips() {
  const { clips, project, openClip, refresh, err } = useApp();
  const total = project?.config.steps.length ?? 0;
  const list = clips.filter((c) => c.status === "draft" || c.status === "making" || c.status === "blocked");

  async function newClip() {
    if (!project) return;
    try {
      const c = await api.createClip(project.id);
      await refresh();
      openClip(c.id);
    } catch (e) {
      err(e);
    }
  }

  return (
    <div>
      <PageHeader title="คิวทำคลิป" desc="คลิปที่กำลังทำ — เปิดดูเพื่อรันทีละขั้นตอน">
        <Button onClick={newClip} disabled={!project}>
          <Plus /> คลิปใหม่
        </Button>
      </PageHeader>
      <GlassCard className="overflow-hidden">
        {list.length === 0 ? (
          <Empty icon={<Clapperboard />} title="ไม่มีคลิปค้างอยู่" desc="กด “คลิปใหม่” แล้วรัน flow ตั้งแต่เลือกหัวข้อไปจนลงคลัง" />
        ) : (
          <div className="grid divide-y divide-[var(--glass-hairline)]">
            <div className="grid grid-cols-[84px_1.2fr_1fr_200px_130px_110px] gap-3 px-5 py-2.5 text-xs font-medium text-muted-foreground">
              <span>รหัส</span>
              <span>ชื่อ</span>
              <span>อ้างอิง</span>
              <span>ความคืบหน้า</span>
              <span>สถานะ</span>
              <span className="text-right">อัปเดต</span>
            </div>
            {list.map((c, i) => (
              <motion.button
                key={c.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 8) * 0.03 }}
                onClick={() => openClip(c.id)}
                className="soft grid grid-cols-[84px_1.2fr_1fr_200px_130px_110px] items-center gap-3 px-5 py-3 text-left hover:bg-[var(--glass-bg-subtle)]"
              >
                <span className="font-mono text-[13px] font-medium">{c.clip_key}</span>
                <span className="truncate text-sm">{c.title || <span className="text-muted-foreground">(ยังไม่มีชื่อ)</span>}</span>
                <span className="truncate text-sm text-muted-foreground">{c.ref || "–"}</span>
                <div className="flex items-center gap-2">
                  <Progress value={(c.done_steps / Math.max(1, total)) * 100} />
                  <span className="w-10 text-right text-xs text-muted-foreground">{c.done_steps}/{total}</span>
                </div>
                <ClipStatusBadge status={c.status} />
                <span className="text-right text-xs text-muted-foreground">{fmtTime(c.updated_at).slice(5)}</span>
              </motion.button>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
