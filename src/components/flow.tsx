import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, Bot, CalendarClock, Check, FolderOpen, Gauge, Hand, ListChecks, Play, RotateCcw, Terminal, Undo2, Cpu, Eye } from "lucide-react";
import { useApp } from "@/lib/store";
import { providerLabel } from "@/components/AgentsCard";
import { api, fileUrl } from "@/lib/api";
import type { Clip, StepDef, StepRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { GlassCard, CardBody, CardDesc, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
export const kindMeta: Record<string, { label: string; icon: React.ReactNode }> = {
  pick: { label: "เลือกจากคลัง", icon: <ListChecks /> },
  ai: { label: "AI", icon: <Bot /> },
  shell: { label: "สคริปต์", icon: <Terminal /> },
  check: { label: "ตรวจไฟล์", icon: <Gauge /> },
  deliver: { label: "ลงคลัง", icon: <FolderOpen /> },
  manual: { label: "ยืนยันเอง", icon: <Hand /> },
  post: { label: "ตั้งโพสต์", icon: <CalendarClock /> },
};

export function StepPanel({
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
          <p className="text-sm text-muted-foreground">บันทึกเวลาโพสต์และลิงก์ในแท็บ Publish แล้วกดยืนยันเมื่อเรียบร้อย</p>
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

export function FlowAgentPanel({ clip, row, live, running, waiting, onStart, onCancel }: { clip: Clip; row?: StepRow; live?: string[]; running: boolean; waiting?: string; onStart: () => void; onCancel: () => void }) {
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

