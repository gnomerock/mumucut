import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowLeft, ArrowUp, Bot, Download, FolderOpen, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { api, pickFolder } from "@/lib/api";
import { blankConfig, defaultText, templates } from "@/lib/templates";
import type { Project, ProjectConfig, StepDef, StepKind } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { CardBody, CardDesc, CardHeader, CardTitle, GlassCard } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Empty, PageHeader } from "@/components/common";
import { cn } from "@/lib/utils";

export default function Projects() {
  const { projects, refresh, err, notify, setProjectId } = useApp();
  const [editing, setEditing] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);

  if (editing)
    return (
      <Editor
        project={editing}
        onBack={() => setEditing(null)}
        onSaved={async (p) => {
          try {
            const saved = await api.saveProject(p);
            setEditing(saved);
            await refresh();
            notify("บันทึกโปรเจกต์แล้ว");
          } catch (e) {
            err(e);
          }
        }}
      />
    );

  return (
    <div>
      <PageHeader title="โปรเจกต์" desc="แต่ละช่อง/ซีรีส์มีโฟลเดอร์งาน โฟลเดอร์คลัง สไตล์ข้อความ และ flow ของตัวเอง">
        <Button onClick={() => setCreating(true)}>
          <Plus /> โปรเจกต์ใหม่
        </Button>
      </PageHeader>

      {projects.length === 0 ? (
        <GlassCard>
          <Empty icon={<FolderOpen />} title="ยังไม่มีโปรเจกต์" desc="เริ่มจากแม่แบบ “ธรรมะผู้สูงอายุ” เพื่อได้ flow เดียวกับที่ทำอยู่ แล้วนำเข้าคลิปเดิมจากโฟลเดอร์คลัง">
            <Button onClick={() => setCreating(true)}><Plus /> สร้างโปรเจกต์</Button>
          </Empty>
        </GlassCard>
      ) : (
        <div className="grid gap-3.5">
          {projects.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <GlassCard>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    <CardDesc className="mt-0.5 truncate font-mono text-xs">{p.workdir || "(ยังไม่ตั้งโฟลเดอร์งาน)"}</CardDesc>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="glass"
                      size="sm"
                      title="อ่านโฟลเดอร์คลังแล้วเพิ่มคลิปที่ยังไม่อยู่ในโปรแกรม"
                      onClick={async () => {
                        try {
                          const n = await api.importLibrary(p.id);
                          setProjectId(p.id);
                          await refresh();
                          notify(n > 0 ? `นำเข้า ${n} คลิปจากคลัง` : "ไม่มีคลิปใหม่ให้นำเข้า");
                        } catch (e) {
                          err(e);
                        }
                      }}
                    >
                      <Download /> นำเข้าจากคลัง
                    </Button>
                    <Button variant="glass" size="sm" onClick={() => setEditing(p)}>
                      <Pencil /> แก้ไข
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon-sm"
                      title="ลบโปรเจกต์ (ไฟล์บนดิสก์ไม่ถูกลบ)"
                      onClick={async () => {
                        if (!window.confirm(`ลบโปรเจกต์ “${p.name}” และคลิปทั้งหมดในโปรแกรม? (ไฟล์บนดิสก์ไม่ถูกลบ)`)) return;
                        try {
                          await api.deleteProject(p.id);
                          await refresh();
                        } catch (e) {
                          err(e);
                        }
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </CardHeader>
                <CardBody className="flex flex-wrap items-center gap-2 pt-2 text-[13px] text-muted-foreground">
                  <Badge>{p.config.steps.length} ขั้นตอน</Badge>
                  <Badge>{p.config.width}×{p.config.height} · {p.config.fps} fps · ≤{p.config.max_seconds} วิ</Badge>
                  <Badge>ฟอนต์ {p.config.text?.font ?? "–"}</Badge>
                  <Badge>รหัส {p.key_prefix}nn</Badge>
                  <span className="truncate font-mono text-xs">คลัง: {p.library_dir || "–"}</span>
                </CardBody>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      )}

      <CreateDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function CreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { refresh, err, notify, setProjectId } = useApp();
  const [tid, setTid] = useState("dhamma");
  const t = templates.find((x) => x.id === tid)!;
  const [name, setName] = useState("");
  const [workdir, setWorkdir] = useState<string | null>(null);
  const [library, setLibrary] = useState<string | null>(null);
  const [prefix, setPrefix] = useState<string | null>(null);
  const pick = async (set: (s: string) => void) => {
    const f = await pickFolder();
    if (f) set(f);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div>
          <DialogTitle>โปรเจกต์ใหม่</DialogTitle>
          <DialogDescription>เลือกแม่แบบ flow แล้วชี้โฟลเดอร์งานกับโฟลเดอร์คลัง</DialogDescription>
        </div>
        <div className="grid gap-2">
          {templates.map((x) => (
            <button
              key={x.id}
              onClick={() => { setTid(x.id); setWorkdir(null); setLibrary(null); setPrefix(null); }}
              className={cn("soft rounded-lg border p-3.5 text-left", tid === x.id ? "bg-[var(--glass-bg-strong)] ring-1 ring-ring" : "hover:bg-[var(--glass-bg-subtle)]")}
            >
              <div className="text-sm font-semibold">{x.name}</div>
              <div className="text-[13px] text-muted-foreground">{x.desc}</div>
            </button>
          ))}
        </div>
        <Field label="ชื่อโปรเจกต์"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.id === "dhamma" ? "ธรรมะผู้สูงอายุ" : "ช่องของฉัน"} /></Field>
        <Field label="โฟลเดอร์งาน (โปรเจกต์ที่เรนเดอร์คลิป)">
          <div className="flex gap-2">
            <Input value={workdir ?? t.workdir} onChange={(e) => setWorkdir(e.target.value)} className="font-mono text-[13px]" />
            <Button variant="glass" size="icon" onClick={() => pick(setWorkdir)} title="เลือกโฟลเดอร์"><FolderOpen /></Button>
          </div>
        </Field>
        <Field label="โฟลเดอร์คลัง (ที่เก็บคลิปที่เสร็จแล้ว)">
          <div className="flex gap-2">
            <Input value={library ?? t.library} onChange={(e) => setLibrary(e.target.value)} className="font-mono text-[13px]" />
            <Button variant="glass" size="icon" onClick={() => pick(setLibrary)} title="เลือกโฟลเดอร์"><FolderOpen /></Button>
          </div>
        </Field>
        <Field label="ตัวอักษรนำหน้ารหัสคลิป" hint="เช่น EP → EP01, EP02 …"><Input className="w-28" value={prefix ?? t.prefix} onChange={(e) => setPrefix(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button
            onClick={async () => {
              try {
                const lib = library ?? t.library;
                const p = await api.saveProject({
                  id: 0,
                  name: name.trim() || (t.id === "dhamma" ? "ธรรมะผู้สูงอายุ" : "โปรเจกต์ใหม่"),
                  workdir: workdir ?? t.workdir,
                  library_dir: lib,
                  key_prefix: prefix ?? t.prefix,
                  config: t.id === "dhamma" ? t.config() : blankConfig(),
                });
                setProjectId(p.id);
                await refresh();
                onOpenChange(false);
                notify(`สร้างโปรเจกต์ “${p.name}” แล้ว`);
              } catch (e) {
                err(e);
              }
            }}
          >
            สร้าง
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const kinds: { id: StepKind; label: string }[] = [
  { id: "pick", label: "เลือกหัวข้อจากคลัง (CSV)" },
  { id: "ai", label: "AI (เขียนบท/ออกแบบ)" },
  { id: "shell", label: "สคริปต์/คำสั่ง" },
  { id: "check", label: "ตรวจไฟล์วิดีโอ" },
  { id: "deliver", label: "ลงคลัง" },
  { id: "manual", label: "ยืนยันเอง" },
  { id: "post", label: "ตั้งโพสต์" },
];

function num(v: string, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function Editor({ project, onBack, onSaved }: { project: Project; onBack: () => void; onSaved: (p: Project) => Promise<void> }) {
  const [p, setP] = useState<Project>(structuredClone(project));
  const c = p.config;
  const setC = (patch: Partial<ProjectConfig>) => setP({ ...p, config: { ...c, ...patch } });
  const text = c.text ?? defaultText();
  const setStep = (i: number, patch: Partial<StepDef>) => setC({ steps: c.steps.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const [open, setOpen] = useState<number | null>(null);
  const dirty = JSON.stringify(p) !== JSON.stringify(project);

  return (
    <div>
      <PageHeader title={p.name || "โปรเจกต์"} desc="แก้ค่าแล้วกดบันทึก — มีผลกับคลิปที่รันหลังจากนี้">
        <Button variant="glass" onClick={onBack}><ArrowLeft /> กลับ</Button>
        <Button disabled={!dirty} onClick={() => onSaved(p)}><Save /> บันทึก</Button>
      </PageHeader>
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">ทั่วไป</TabsTrigger>
          <TabsTrigger value="style">สไตล์ข้อความ</TabsTrigger>
          <TabsTrigger value="steps">ขั้นตอน ({c.steps.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="pt-4">
          <GlassCard>
            <CardBody className="grid gap-4 pt-5">
              <div className="grid grid-cols-2 gap-4">
                <Field label="ชื่อ"><Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
                <Field label="รหัสนำหน้า"><Input value={p.key_prefix} onChange={(e) => setP({ ...p, key_prefix: e.target.value })} /></Field>
                <Field label="โฟลเดอร์งาน" hint="คำสั่งทุกขั้นตอนรันที่นี่"><Input className="font-mono text-[13px]" value={p.workdir} onChange={(e) => setP({ ...p, workdir: e.target.value })} /></Field>
                <Field label="โฟลเดอร์คลัง"><Input className="font-mono text-[13px]" value={p.library_dir} onChange={(e) => setP({ ...p, library_dir: e.target.value })} /></Field>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <Field label="กว้าง (px)"><Input type="number" value={c.width} onChange={(e) => setC({ width: num(e.target.value, 1080) })} /></Field>
                <Field label="สูง (px)"><Input type="number" value={c.height} onChange={(e) => setC({ height: num(e.target.value, 1920) })} /></Field>
                <Field label="เฟรมเรต"><Input type="number" value={c.fps} onChange={(e) => setC({ fps: num(e.target.value, 30) })} /></Field>
                <Field label="ยาวสุด (วินาที)"><Input type="number" value={c.max_seconds} onChange={(e) => setC({ max_seconds: num(e.target.value, 30) })} /></Field>
                <Field label="LUFS ต่ำสุด"><Input type="number" step="0.5" value={c.lufs_min} onChange={(e) => setC({ lufs_min: num(e.target.value) })} /></Field>
                <Field label="LUFS สูงสุด"><Input type="number" step="0.5" value={c.lufs_max} onChange={(e) => setC({ lufs_max: num(e.target.value) })} /></Field>
                <Field label="พีคสูงสุด (dBFS)"><Input type="number" step="0.5" value={c.peak_max} onChange={(e) => setC({ peak_max: num(e.target.value) })} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="ไฟล์วิดีโอที่ได้ (เทียบกับโฟลเดอร์งาน)" hint="ใช้ {key} แทนรหัสคลิป"><Input className="font-mono text-[13px]" value={c.video_file} onChange={(e) => setC({ video_file: e.target.value })} /></Field>
                <Field label="ไฟล์ปก"><Input className="font-mono text-[13px]" value={c.cover_file} onChange={(e) => setC({ cover_file: e.target.value })} /></Field>
              </div>
              <Field label="ไฟล์เพิ่มที่คัดลอกลงคลัง (บรรทัดละไฟล์, ใช้ * ในชื่อไฟล์ได้)">
                <Textarea rows={3} className="font-mono text-[13px]" value={c.extra_files.join("\n")} onChange={(e) => setC({ extra_files: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />
              </Field>
              <div>
                <div className="pb-2 text-sm font-semibold">คลังหัวข้อ (CSV) สำหรับขั้นตอน “เลือกหัวข้อ”</div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="ไฟล์ CSV" hint="ใส่ * ได้ เช่น quotes_candidates*.csv"><Input className="font-mono text-[13px]" value={c.pool.csv} onChange={(e) => setC({ pool: { ...c.pool, csv: e.target.value } })} /></Field>
                  <Field label="ข้อความนำหน้าอ้างอิง"><Input value={c.pool.ref_prefix} onChange={(e) => setC({ pool: { ...c.pool, ref_prefix: e.target.value } })} /></Field>
                </div>
                <div className="mt-3 grid grid-cols-5 gap-4">
                  <Field label="คอลัมน์ที่อ้างอิง"><Input type="number" value={c.pool.ref_col} onChange={(e) => setC({ pool: { ...c.pool, ref_col: num(e.target.value) } })} /></Field>
                  <Field label="คอลัมน์ชื่อ"><Input type="number" value={c.pool.title_col} onChange={(e) => setC({ pool: { ...c.pool, title_col: num(e.target.value) } })} /></Field>
                  <Field label="คอลัมน์ต้นฉบับ"><Input value={c.pool.brief_cols.join(",")} onChange={(e) => setC({ pool: { ...c.pool, brief_cols: e.target.value.split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n >= 0) } })} /></Field>
                  <Field label="คอลัมน์ “ใช้แล้ว”" hint="-1 = ไม่มี"><Input type="number" value={c.pool.used_col} onChange={(e) => setC({ pool: { ...c.pool, used_col: num(e.target.value, -1) } })} /></Field>
                  <Field label="คอลัมน์เรตติ้ง" hint="-1 = ไม่มี"><Input type="number" value={c.pool.rating_col} onChange={(e) => setC({ pool: { ...c.pool, rating_col: num(e.target.value, -1) } })} /></Field>
                </div>
                <Field className="mt-3" label="ข้ามแถวที่เรตติ้งมีคำว่า" hint="ใช้เป็นตัวเลือกสุดท้ายเมื่อไม่เหลือแถวอื่น"><Input value={c.pool.skip_rating} onChange={(e) => setC({ pool: { ...c.pool, skip_rating: e.target.value } })} /></Field>
                <p className="mt-2 text-xs text-muted-foreground">เลขคอลัมน์นับจาก 0</p>
              </div>
            </CardBody>
          </GlassCard>
        </TabsContent>

        <TabsContent value="style" className="pt-4">
          <div className="grid grid-cols-[1fr_300px] gap-4">
            <GlassCard>
              <CardHeader>
                <div>
                  <CardTitle>สไตล์ข้อความบนวิดีโอ</CardTitle>
                  <CardDesc>ค่ามาตรฐาน: ไม่มีกล่องหลังตัวอักษร ขอบ 10 px เงา 20 px สีขาว + แดงกุหลาบเฉพาะคำเน้น</CardDesc>
                </div>
                <Button variant="glass" size="sm" onClick={() => setC({ text: defaultText(text.font) })}>คืนค่ามาตรฐาน</Button>
              </CardHeader>
              <CardBody className="grid gap-4">
                <div className="grid grid-cols-3 gap-4">
                  <Field label="ฟอนต์"><Input value={text.font} onChange={(e) => setC({ text: { ...text, font: e.target.value } })} /></Field>
                  <Field label="ขอบ (px)"><Input type="number" value={text.stroke} onChange={(e) => setC({ text: { ...text, stroke: num(e.target.value, 10) } })} /></Field>
                  <Field label="เงา (px)"><Input type="number" value={text.shadow} onChange={(e) => setC({ text: { ...text, shadow: num(e.target.value, 20) } })} /></Field>
                  <Field label="สีหลัก"><Input value={text.white} onChange={(e) => setC({ text: { ...text, white: e.target.value } })} /></Field>
                  <Field label="สีเน้น"><Input value={text.rose} onChange={(e) => setC({ text: { ...text, rose: e.target.value } })} /></Field>
                </div>
                <div>
                  <div className="pb-2 text-[13px] font-medium text-muted-foreground">พื้นที่ปลอดภัยของข้อความ (px ที่ {c.width}×{c.height})</div>
                  <div className="grid grid-cols-4 gap-4">
                    {(["left", "right", "top", "bottom"] as const).map((k) => (
                      <Field key={k} label={{ left: "ซ้าย", right: "ขวา", top: "บน", bottom: "ล่าง" }[k]}>
                        <Input type="number" value={text.safe[k]} onChange={(e) => setC({ text: { ...text, safe: { ...text.safe, [k]: num(e.target.value) } } })} />
                      </Field>
                    ))}
                  </div>
                </div>
              </CardBody>
            </GlassCard>
            <TextPreview c={c} />
          </div>
        </TabsContent>

        <TabsContent value="steps" className="pt-4">
          <div className="grid gap-2.5">
            {c.steps.map((s, i) => (
              <GlassCard key={i}>
                <div className="flex items-center gap-2 px-4 py-2.5">
                  <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpen(open === i ? null : i)}>
                    <span className="grid size-6 place-items-center rounded-full bg-foreground/10 text-xs font-semibold">{i + 1}</span>
                    <span className="truncate text-sm font-medium">{s.label || s.key}</span>
                    <span className="font-mono text-xs text-muted-foreground">{s.key}</span>
                    {s.kind === "ai" && <Bot className="size-3.5 text-rose" />}
                    <Badge>{kinds.find((k) => k.id === s.kind)?.label}</Badge>
                  </button>
                  <Button variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => { const a = [...c.steps]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setC({ steps: a }); }}><ArrowUp /></Button>
                  <Button variant="ghost" size="icon-sm" disabled={i === c.steps.length - 1} onClick={() => { const a = [...c.steps]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; setC({ steps: a }); }}><ArrowDown /></Button>
                  <Button variant="destructive" size="icon-sm" onClick={() => setC({ steps: c.steps.filter((_, k) => k !== i) })}><Trash2 /></Button>
                </div>
                <AnimatePresence initial={false}>
                  {open === i && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="grid gap-3 border-t border-[var(--glass-hairline)] px-4 pb-4 pt-3">
                        <div className="grid grid-cols-3 gap-3">
                          <Field label="รหัสขั้นตอน (ภาษาอังกฤษ)"><Input value={s.key} onChange={(e) => setStep(i, { key: e.target.value.replace(/\s+/g, "_") })} /></Field>
                          <Field label="ชื่อที่แสดง"><Input value={s.label} onChange={(e) => setStep(i, { label: e.target.value })} /></Field>
                          <Field label="ชนิด">
                            <Select value={s.kind} onValueChange={(v) => setStep(i, { kind: v as StepKind })}>
                              <SelectTrigger>{kinds.find((k) => k.id === s.kind)?.label}</SelectTrigger>
                              <SelectContent>{kinds.map((k) => <SelectItem key={k.id} value={k.id}>{k.label}</SelectItem>)}</SelectContent>
                            </Select>
                          </Field>
                        </div>
                        <Field label="คำอธิบาย"><Input value={s.desc} onChange={(e) => setStep(i, { desc: e.target.value })} /></Field>
                        {s.kind === "ai" && (
                          <>
                            <Field label="Prompt" hint="ตัวแปร: {key} {title} {ref} {brief} {script} {caption} {line_ids}"><Textarea rows={8} value={s.prompt} onChange={(e) => setStep(i, { prompt: e.target.value })} /></Field>
                            <div className="grid grid-cols-2 gap-3">
                              <Field label="เขียนคำตอบลงไฟล์" hint="เทียบกับโฟลเดอร์งาน"><Input className="font-mono text-[13px]" value={s.output_file} onChange={(e) => setStep(i, { output_file: e.target.value })} /></Field>
                              <Field label="หรือรวมคีย์ระดับบนเข้าไฟล์ JSON"><Input className="font-mono text-[13px]" value={s.merge_into} onChange={(e) => setStep(i, { merge_into: e.target.value })} /></Field>
                            </div>
                          </>
                        )}
                        {(s.kind === "shell" || s.kind === "ai") && (
                          <Field label={s.kind === "ai" ? "คำสั่งที่รันต่อหลังได้คำตอบ (ไม่บังคับ)" : "คำสั่ง (PowerShell, หนึ่งคำสั่งต่อบรรทัด, หยุดทันทีถ้าคำสั่งใดล้มเหลว)"}>
                            <Textarea rows={5} className="console text-[12.5px]" value={s.cmd} onChange={(e) => setStep(i, { cmd: e.target.value })} spellCheck={false} />
                          </Field>
                        )}
                        <div className="grid grid-cols-[1fr_auto_auto] items-end gap-5">
                          <Field label="ภาพตัวอย่างในหน้าขั้นตอน (ไม่บังคับ)"><Input className="font-mono text-[13px]" value={s.preview} onChange={(e) => setStep(i, { preview: e.target.value })} /></Field>
                          <label className="flex items-center gap-2 pb-1.5 text-sm"><Switch checked={s.gate} onCheckedChange={(v) => setStep(i, { gate: v })} /> ต้องตรวจก่อนไปต่อ</label>
                          <label className="flex items-center gap-2 pb-1.5 text-sm"><Switch checked={s.gpu} onCheckedChange={(v) => setStep(i, { gpu: v })} /> ใช้การ์ดจอ</label>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </GlassCard>
            ))}
            <div>
              <Button
                variant="glass"
                onClick={() => {
                  setC({ steps: [...c.steps, { key: `step${c.steps.length + 1}`, label: "ขั้นตอนใหม่", desc: "", kind: "shell", cmd: "", prompt: "", output_file: "", merge_into: "", gate: false, gpu: false, preview: "" }] });
                  setOpen(c.steps.length);
                }}
              >
                <Plus /> เพิ่มขั้นตอน
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TextPreview({ c }: { c: ProjectConfig }) {
  const t = c.text ?? defaultText();
  const W = 240;
  const k = W / c.width;
  const H = c.height * k;
  const strokeStyle: React.CSSProperties = {
    fontFamily: `"${t.font}", "Sarabun", sans-serif`,
    fontSize: 74 * k,
    fontWeight: 700,
    lineHeight: 1.3,
    color: t.white,
    paintOrder: "stroke fill",
    WebkitTextStroke: `${Math.max(1, t.stroke * k)}px #0b0b10`,
    textShadow: `0 0 ${t.shadow * k}px rgba(0,0,0,.85)`,
    textAlign: "center",
  };
  return (
    <GlassCard className="self-start p-3">
      <div className="mx-auto overflow-hidden rounded-md" style={{ width: W, height: H }}>
        <div className="relative size-full bg-[linear-gradient(170deg,#7c8aa8,#3b4258_55%,#2a2e40)]">
          <div
            className="absolute border border-dashed border-white/55"
            style={{ left: t.safe.left * k, top: t.safe.top * k, width: (t.safe.right - t.safe.left) * k, height: (t.safe.bottom - t.safe.top) * k }}
          />
          <div className="absolute inset-x-0" style={{ top: 1180 * k, left: t.safe.left * k, right: (c.width - t.safe.right) * k }}>
            <div style={strokeStyle}>
              ใจเรากวัดแกว่งง่ายไหม
              <br />
              <span style={{ color: t.rose }}>ดัดใจให้ตรง</span>
            </div>
          </div>
        </div>
      </div>
      <p className="pt-2 text-center text-xs text-muted-foreground">ตัวอย่างอัตราส่วนจริง · เส้นประ = พื้นที่ปลอดภัย</p>
    </GlassCard>
  );
}
