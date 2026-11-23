import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Bot, Check, Clapperboard, Code2, FolderOpen, Hand, Scissors } from "lucide-react";
import { useApp } from "@/lib/store";
import { api, defaultChannelDir, pickFolder } from "@/lib/api";
import { blankConfig, templates } from "@/lib/templates";
import type { Renderer } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const renderers: { id: Renderer; title: string; desc: string; icon: React.ReactNode }[] = [
  { id: "remotion", title: "Remotion", desc: "เขียนคลิปด้วย React แล้วเรนเดอร์ (AI แก้โค้ดให้ได้)", icon: <Code2 /> },
  { id: "hyperframes", title: "HyperFrames", desc: "เขียนคลิปเป็น HTML แล้วเรนเดอร์เป็น MP4", icon: <Clapperboard /> },
  { id: "manual", title: "ตัดต่อเอง", desc: "ตัดในโปรแกรมที่ถนัด แล้วแนบไฟล์วิดีโอเข้ามา", icon: <Scissors /> },
];

const STEPS = ["ช่องของคุณ", "วิธีทำคลิป", "ที่เก็บไฟล์"];

/** Creates a channel in three short steps. Used on first launch (full page) and from the channel menu (dialog). */
export function ChannelWizard({ first = false, onDone, onCancel }: { first?: boolean; onDone?: () => void; onCancel?: () => void }) {
  const { refresh, err, notify, setProjectId, go, settings } = useApp();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [prefix, setPrefix] = useState("CL");
  const [tid, setTid] = useState("blank");
  // the default video engine chosen in Settings → AI providers → Video
  const [renderer, setRenderer] = useState<Renderer>(settings.default_video === "hyperframes" ? "hyperframes" : "remotion");
  const [runMode, setRunMode] = useState<"steps" | "agent">("steps");
  const [workdir, setWorkdir] = useState("");
  const [library, setLibrary] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const t = templates.find((x) => x.id === tid)!;

  // folder suggestions follow the name and template until the user edits them
  useEffect(() => {
    if (touched) return;
    if (t.workdir) {
      setWorkdir(t.workdir);
      setLibrary(t.library);
      return;
    }
    let off = false;
    void defaultChannelDir(name || "ช่องใหม่", settings.projects_root).then((d) => {
      if (off) return;
      setWorkdir(d);
      setLibrary(`${d}\\library`);
    });
    return () => {
      off = true;
    };
  }, [name, t, touched, settings.projects_root]);

  useEffect(() => {
    setPrefix(t.prefix);
    setRunMode(t.id === "dhamma" ? "agent" : "steps");
    if (t.id === "dhamma") {
      setRenderer("remotion");
      if (!desc) setDesc(t.config().description ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tid]);

  const canNext = step === 0 ? name.trim().length > 0 : step === 2 ? workdir.trim().length > 0 : true;

  async function create() {
    setBusy(true);
    try {
      const base = t.id === "dhamma" ? t.config() : blankConfig();
      if (t.id !== "dhamma") {
        await api.ensureDir(workdir);
        await api.ensureDir(library);
      }
      const p = await api.saveProject({
        id: 0,
        name: name.trim(),
        workdir: workdir.trim(),
        library_dir: library.trim(),
        key_prefix: prefix.trim() || "CL",
        config: { ...base, description: desc.trim(), renderer, run_mode: runMode },
      });
      setProjectId(p.id);
      await refresh();
      go("projects");
      notify(`สร้างช่อง “${p.name}” แล้ว เริ่มโปรเจกต์คลิปแรกได้เลย`);
      onDone?.();
    } catch (e) {
      err(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      <ol className="flex items-center gap-2" aria-label="ขั้นตอนสร้างช่อง">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full text-xs font-semibold transition-colors",
                i < step ? "bg-success/20 text-success" : i === step ? "bg-primary text-primary-foreground" : "bg-foreground/10 text-muted-foreground",
              )}
            >
              {i < step ? <Check className="size-3.5" strokeWidth={2.5} /> : i + 1}
            </span>
            <span className={cn("text-[13px]", i === step ? "font-medium" : "text-muted-foreground")}>{s}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-[var(--glass-hairline)]" />}
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.18 }} className="grid gap-4">
          {step === 0 && (
            <>
              <Field label="ชื่อช่อง" hint={first ? "ชื่อเดียวกับเพจหรือช่องบนโซเชียลก็ได้ เปลี่ยนทีหลังได้" : undefined}>
                <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น คู่มือกันตุย" onKeyDown={(e) => e.key === "Enter" && canNext && setStep(1)} />
              </Field>
              <Field label="ช่องนี้ทำคลิปเรื่องอะไร" hint="AI ใช้ข้อความนี้ตอนช่วยคิดหัวข้อและเขียนบท">
                <Textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="เช่น คลิป 30 วินาที สอนวิธีเอาตัวรอดเมื่อเกิดภัย 3 ข้อ จากแหล่งทางการ" />
              </Field>
              <Field label="ตัวอักษรนำหน้ารหัสคลิป" hint="เช่น KT → KT01, KT02 …">
                <Input className="w-28" value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} />
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <div className="grid gap-2">
                <div className="text-[13px] font-medium text-muted-foreground">เริ่มจากแม่แบบ flow</div>
                <div className="grid grid-cols-2 gap-2">
                  {templates.map((x) => (
                    <Choice key={x.id} active={tid === x.id} onClick={() => setTid(x.id)} title={x.name} desc={x.desc} />
                  ))}
                </div>
              </div>
              <div className="grid gap-2">
                <div className="text-[13px] font-medium text-muted-foreground">สร้างคลิปด้วย</div>
                <div className="grid grid-cols-3 gap-2">
                  {renderers.map((r) => (
                    <Choice key={r.id} active={renderer === r.id} onClick={() => setRenderer(r.id)} title={r.title} desc={r.desc} icon={r.icon} />
                  ))}
                </div>
              </div>
              <div className="grid gap-2">
                <div className="text-[13px] font-medium text-muted-foreground">ใครเดินขั้นตอน</div>
                <div className="grid grid-cols-2 gap-2">
                  <Choice active={runMode === "steps"} onClick={() => setRunMode("steps")} icon={<Hand />} title="คุณกดทีละขั้นตอน" desc="AI ช่วยเฉพาะขั้นตอนเขียนข้อความ" />
                  <Choice active={runMode === "agent"} onClick={() => setRunMode("agent")} icon={<Bot />} title="AI agent คุมทั้ง flow" desc="agent ทำต่อเนื่องและหยุดรอคุณที่จุดตรวจ" />
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <Field label="โฟลเดอร์งาน" hint="ที่เก็บโค้ดคลิป ไฟล์เสียง ภาพ และ assets ที่ AI สร้าง">
                <FolderInput value={workdir} onChange={(v) => { setTouched(true); setWorkdir(v); }} />
              </Field>
              <Field label="โฟลเดอร์คลัง" hint="ที่เก็บคลิปที่ทำเสร็จแล้ว พร้อมโพสต์">
                <FolderInput value={library} onChange={(v) => { setTouched(true); setLibrary(v); }} />
              </Field>
              <p className="text-xs text-muted-foreground">
                {t.id === "dhamma" ? "แม่แบบนี้ใช้โฟลเดอร์งานที่มีอยู่แล้ว" : "MumuCut จะสร้างโฟลเดอร์ให้ถ้ายังไม่มี"} ตั้งค่าอื่น (ขนาดภาพ ความดัง สไตล์ข้อความ ขั้นตอน) แก้ได้ที่ ตั้งค่าช่อง
              </p>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between gap-2 pt-1">
        <div>
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft /> ย้อนกลับ
            </Button>
          ) : (
            onCancel && <Button variant="ghost" onClick={onCancel}>ยกเลิก</Button>
          )}
        </div>
        {step < STEPS.length - 1 ? (
          <Button disabled={!canNext} onClick={() => setStep(step + 1)}>
            ถัดไป <ArrowRight />
          </Button>
        ) : (
          <Button disabled={!canNext || busy} onClick={create}>
            <Check /> สร้างช่อง
          </Button>
        )}
      </div>
    </div>
  );
}

function Choice({ active, onClick, title, desc, icon }: { active: boolean; onClick: () => void; title: string; desc: string; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("soft rounded-lg border p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-[var(--glass-bg-strong)] ring-1 ring-ring" : "hover:bg-[var(--glass-bg-subtle)]")}
    >
      <div className="flex items-center gap-2 text-sm font-semibold [&_svg]:size-4">
        {icon}
        {title}
      </div>
      <div className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{desc}</div>
    </button>
  );
}

function FolderInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono text-[13px]" />
      <Button
        variant="glass"
        size="icon"
        title="เลือกโฟลเดอร์"
        onClick={async () => {
          const f = await pickFolder();
          if (f) onChange(f);
        }}
      >
        <FolderOpen />
      </Button>
    </div>
  );
}
