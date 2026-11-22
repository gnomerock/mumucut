import { Badge } from "@/components/ui/badge";
import type { ClipStatus, StepStatus } from "@/lib/types";
import { Check, CircleDashed, Eye, Loader2, Minus, X } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export const clipStatusMeta: Record<ClipStatus, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  draft: { label: "ร่าง", tone: "neutral" },
  making: { label: "กำลังทำ", tone: "info" },
  ready: { label: "พร้อมโพสต์", tone: "success" },
  scheduled: { label: "ตั้งเวลาแล้ว", tone: "info" },
  posted: { label: "โพสต์แล้ว", tone: "neutral" },
  hold: { label: "พักไว้", tone: "warning" },
  blocked: { label: "ติดปัญหา", tone: "danger" },
};

export function ClipStatusBadge({ status }: { status: ClipStatus }) {
  const m = clipStatusMeta[status] ?? clipStatusMeta.draft;
  return (
    <Badge tone={m.tone} dot>
      {m.label}
    </Badge>
  );
}

export const stepStatusLabel: Record<StepStatus, string> = {
  pending: "รอ",
  running: "กำลังรัน",
  done: "เสร็จ",
  review: "รอตรวจ",
  failed: "ล้มเหลว",
  skipped: "ข้าม",
};

export function StepDot({ status, size = 22 }: { status: StepStatus; size?: number }) {
  const base = "grid shrink-0 place-items-center rounded-full";
  const style = { width: size, height: size };
  if (status === "running")
    return (
      <span className={cn(base, "bg-foreground/10")} style={style}>
        <Loader2 className="size-3.5 animate-spin" />
      </span>
    );
  if (status === "done")
    return (
      <motion.span initial={{ scale: 0.7 }} animate={{ scale: 1 }} className={cn(base, "bg-success/20 text-success")} style={style}>
        <Check className="size-3.5" strokeWidth={2.5} />
      </motion.span>
    );
  if (status === "review")
    return (
      <span className={cn(base, "bg-warning/25 text-warning")} style={style}>
        <Eye className="size-3.5" />
      </span>
    );
  if (status === "failed")
    return (
      <span className={cn(base, "bg-rose/15 text-rose")} style={style}>
        <X className="size-3.5" strokeWidth={2.5} />
      </span>
    );
  if (status === "skipped")
    return (
      <span className={cn(base, "bg-foreground/8 text-muted-foreground")} style={style}>
        <Minus className="size-3.5" />
      </span>
    );
  return (
    <span className={cn(base, "text-muted-foreground/70")} style={style}>
      <CircleDashed className="size-4" />
    </span>
  );
}

export function PageHeader({ title, desc, children }: { title: string; desc?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 pb-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {desc && <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export function Empty({ icon, title, desc, children }: { icon?: React.ReactNode; title: string; desc?: string; children?: React.ReactNode }) {
  return (
    <div className="grid place-items-center gap-2 px-6 py-14 text-center">
      {icon && <div className="text-muted-foreground/70 [&_svg]:size-8">{icon}</div>}
      <p className="font-medium">{title}</p>
      {desc && <p className="max-w-sm text-sm text-muted-foreground">{desc}</p>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
