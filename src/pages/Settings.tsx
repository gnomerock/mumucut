import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { Bot, Check, Download, FolderOpen, Plug, RefreshCw, SlidersHorizontal, Wrench, X } from "lucide-react";
import { useApp, type Lang, type OpenTo, type Theme } from "@/lib/store";
import { api, isTauri, pickFolder, projectsRoot } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import type { ToolStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { CardBody, CardDesc, CardHeader, CardTitle, GlassCard } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import ProvidersPanel from "@/components/ProvidersPanel";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { currentVersion, installUpdate } from "@/lib/updater";
import { PageHeader } from "@/components/common";
import AgentsCard from "@/components/AgentsCard";
import { cn } from "@/lib/utils";

function SaveInput({ k, placeholder, mono = true }: { k: string; placeholder?: string; mono?: boolean }) {
  const { settings, setSetting, err } = useApp();
  const [v, setV] = useState(settings[k] ?? "");
  useEffect(() => setV(settings[k] ?? ""), [settings, k]);
  return (
    <Input
      value={v}
      placeholder={placeholder}
      className={mono ? "font-mono text-[13px]" : ""}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== (settings[k] ?? "") && setSetting(k, v).catch(err)}
    />
  );
}

const openToOptions: { id: OpenTo; label: string }[] = [
  { id: "projects", label: "Projects" },
  { id: "last", label: "หน้าที่เปิดค้างไว้ล่าสุด" },
  { id: "assets", label: "Assets library" },
  { id: "affiliates", label: "Affiliate library" },
  { id: "settings", label: "Settings" },
];

const langOptions: { id: Lang; label: string; ready: boolean }[] = [
  { id: "system", label: "ตามระบบ", ready: true },
  { id: "th", label: "ไทย", ready: true },
  { id: "en", label: "English (ยังไม่มีคำแปล)", ready: false },
];

function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

/** Settings → ทั่วไป: where the app opens, language, default project folder, theme. */
function GeneralCard({ themes, theme, setTheme }: { themes: { id: Theme; label: string }[]; theme: Theme; setTheme: (t: Theme) => void }) {
  const { settings, setSetting, err, notify } = useApp();
  const [openTo, setOpenTo] = useState<OpenTo>((localStorage.getItem("open_to") as OpenTo) || "projects");
  const [lang, setLang] = useState<Lang>((localStorage.getItem("lang") as Lang) || "system");
  const [root, setRoot] = useState("");
  useEffect(() => {
    void projectsRoot(settings.projects_root).then(setRoot);
  }, [settings.projects_root]);
  const custom = !!settings.projects_root?.trim();
  return (
    <section className="grid max-w-[920px] gap-2">
      <h3 className="text-[15px] font-semibold">ทั่วไป</h3>
      <div className="glass divide-y divide-[var(--glass-hairline)] overflow-hidden rounded-xl">
        <Row title="เปิดแอปที่" desc="หน้าแรกที่เห็นตอนเปิด MumuCut">
          <div className="w-56">
            <Select
              value={openTo}
              onValueChange={(v) => {
                const o = v as OpenTo;
                setOpenTo(o);
                localStorage.setItem("open_to", o);
                setSetting("open_to", o).catch(err);
              }}
            >
              <SelectTrigger className="h-8 text-[13px]">{openToOptions.find((o) => o.id === openTo)?.label}</SelectTrigger>
              <SelectContent>{openToOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </Row>
        <Row title="ภาษา" desc={`ตอนนี้หน้าจอมีภาษาไทยภาษาเดียว${lang === "system" && !navigator.language.startsWith("th") ? ` (ระบบเป็น ${navigator.language} จึงแสดงภาษาไทยไปก่อน)` : ""}`}>
          <div className="w-56">
            <Select
              value={lang}
              onValueChange={(v) => {
                const l = v as Lang;
                setLang(l);
                localStorage.setItem("lang", l);
                setSetting("lang", l).catch(err);
              }}
            >
              <SelectTrigger className="h-8 text-[13px]">{langOptions.find((o) => o.id === lang)?.label}</SelectTrigger>
              <SelectContent>
                {langOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id} disabled={!o.ready}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Row>
        <Row title="ที่เก็บโปรเจกต์" desc="ช่องใหม่จะสร้างโฟลเดอร์ไว้ที่นี่ตามค่าเริ่มต้น (ช่องเดิมไม่ย้าย)">
          <span className="max-w-[320px] truncate font-mono text-xs text-muted-foreground" title={root} dir="rtl">
            {root}
          </span>
          {custom && (
            <Button variant="ghost" size="sm" onClick={() => setSetting("projects_root", "").then(() => notify("กลับไปใช้ Documents\\MumuCut")).catch(err)}>
              ค่าเริ่มต้น
            </Button>
          )}
          <Button
            variant="glass"
            size="sm"
            onClick={async () => {
              const f = await pickFolder();
              if (!f) {
                if (!isTauri) notify("เลือกโฟลเดอร์ได้เฉพาะในแอป", "info");
                return;
              }
              try {
                await setSetting("projects_root", f);
                notify(`ช่องใหม่จะสร้างที่\n${f}`);
              } catch (e) {
                err(e);
              }
            }}
          >
            <FolderOpen /> เปลี่ยน
          </Button>
        </Row>
        <Row title="ธีม" desc="สีของหน้าจอ">
          <div className="glass-subtle inline-flex rounded-md p-0.5">
            {themes.map((t) => (
              <button key={t.id} onClick={() => setTheme(t.id)} className={cn("soft h-7 rounded-sm px-3.5 text-[13px] font-medium", theme === t.id ? "bg-[var(--glass-bg-strong)]" : "text-muted-foreground hover:text-foreground")}>
                {t.label}
              </button>
            ))}
          </div>
        </Row>
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const { theme, setTheme, settings, setSetting, err, update, checkUpdate } = useApp();
  const [version, setVersion] = useState("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [progress, setProgress] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    void currentVersion().then(setVersion);
  }, []);
  const [tools, setTools] = useState<ToolStatus[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [sec, setSec] = useState<"providers" | "agents" | "general">("providers");
  const sections = [
    { id: "providers" as const, label: "AI providers", icon: <Plug /> },
    { id: "agents" as const, label: "AI agents", icon: <Bot /> },
    { id: "general" as const, label: "ทั่วไป", icon: <SlidersHorizontal /> },
  ];

  const check = useCallback(async () => {
    setChecking(true);
    try {
      setTools(await api.checkTools());
    } catch (e) {
      err(e);
    } finally {
      setChecking(false);
    }
  }, [err]);
  useEffect(() => {
    void check();
  }, [check]);

  const themes: { id: Theme; label: string }[] = [
    { id: "light", label: "สว่าง" },
    { id: "dark", label: "มืด" },
    { id: "system", label: "ตามระบบ" },
  ];

  return (
    <div className="grid gap-4 pb-4">
      <PageHeader title="Settings" desc={isTauri ? "ผู้ให้บริการ AI สำหรับข้อความ ภาพ วิดีโอ และเสียง ค่าเก็บในเครื่องนี้ ส่วน API key เก็บใน Windows Credential Manager" : "โหมดดูตัวอย่างในเบราว์เซอร์ ข้อมูลเป็นตัวอย่าง"} />

      <div className="glass-subtle flex w-fit gap-0.5 rounded-lg p-1" role="tablist" aria-label="หมวดการตั้งค่า">
        {sections.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={sec === s.id}
            onClick={() => setSec(s.id)}
            className={cn(
              "soft flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4",
              sec === s.id ? "bg-[var(--glass-bg-strong)] text-foreground shadow-sm ring-1 ring-[var(--glass-hairline)]" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </div>

      {sec === "providers" && <ProvidersPanel onOpenAgents={() => setSec("agents")} />}
      {sec === "agents" && <AgentsCard />}
      {sec === "general" && (
      <div className="grid max-w-[920px] gap-4">
      <GeneralCard themes={themes} theme={theme} setTheme={setTheme} />

      <GlassCard>
        <CardHeader>
          <div>
            <div className="flex items-center gap-2.5"><Download className="size-4" /><CardTitle>อัปเดตแอพ</CardTitle></div>
            <CardDesc className="mt-1">เวอร์ชันที่ใช้อยู่ {version || "-"} ตรวจเวอร์ชันใหม่จาก GitHub Releases และตรวจลายเซ็นก่อนติดตั้งทุกครั้ง</CardDesc>
          </div>
          <Button
            variant="glass"
            size="sm"
            disabled={checkingUpdate || progress !== undefined}
            onClick={async () => {
              setCheckingUpdate(true);
              await checkUpdate(true);
              setCheckingUpdate(false);
            }}
          >
            <RefreshCw className={cn(checkingUpdate && "animate-spin")} /> ตรวจหาเวอร์ชันใหม่
          </Button>
        </CardHeader>
        <CardBody className="grid gap-3">
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={settings.auto_update !== "0"} onCheckedChange={(v) => setSetting("auto_update", v ? "1" : "0").catch(err)} />
            ตรวจหาเวอร์ชันใหม่อัตโนมัติทุกครั้งที่เปิดแอพ
          </label>
          {update && (
            <div className="glass-subtle grid gap-3 rounded-md p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">มีเวอร์ชัน {update.version}</div>
                  {update.notes && <div className="mt-1 whitespace-pre-wrap text-[13px] text-muted-foreground">{update.notes}</div>}
                </div>
                <Button
                  disabled={progress !== undefined}
                  onClick={async () => {
                    setProgress(null);
                    try {
                      await installUpdate(setProgress);
                    } catch (e) {
                      setProgress(undefined);
                      err(e);
                    }
                  }}
                >
                  <Download /> ติดตั้งและรีสตาร์ท
                </Button>
              </div>
              {progress !== undefined && <Progress value={progress ?? 5} />}
              <p className="text-xs text-muted-foreground">ข้อมูลและโปรเจกต์ของคุณไม่ถูกแตะ งานที่กำลังรันอยู่จะหยุดตอนรีสตาร์ท</p>
            </div>
          )}
        </CardBody>
      </GlassCard>

      <GlassCard>
        <CardHeader>
          <div>
            <div className="flex items-center gap-2.5"><Wrench className="size-4" /><CardTitle>เครื่องมือที่ flow เรียกใช้</CardTitle></div>
            <CardDesc className="mt-1">ถ้าไม่อยู่ใน PATH ให้ใส่โฟลเดอร์ไว้ที่นี่</CardDesc>
          </div>
          <Button variant="glass" size="sm" onClick={check} disabled={checking}>
            <RefreshCw className={cn(checking && "animate-spin")} /> ตรวจใหม่
          </Button>
        </CardHeader>
        <CardBody className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="โฟลเดอร์ Node.js"><SaveInput k="node_dir" placeholder="C:\Users\…\fnm\node-versions\v24.13.0\installation" /></Field>
            <Field label="โฟลเดอร์ ffmpeg (ที่มี ffmpeg.exe และ ffprobe.exe)"><SaveInput k="ffmpeg_dir" placeholder="ไม่ต้องใส่ถ้าอยู่ใน PATH" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {(tools ?? []).map((t, i) => (
              <motion.div key={t.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="glass-subtle flex items-center gap-3 rounded-md px-3.5 py-2.5">
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", t.ok ? "bg-success/20 text-success" : "bg-foreground/8 text-muted-foreground")}>
                  {t.ok ? <Check className="size-3.5" strokeWidth={2.5} /> : <X className="size-3.5" />}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{t.name}</div>
                  <div className="truncate text-xs text-muted-foreground" title={t.detail}>{t.detail}</div>
                </div>
              </motion.div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge>ComfyUI และ VoiceStudio ใช้การ์ดจอรันพร้อมกันไม่ได้ (8 GB)</Badge>
            <Badge>ขั้นตอนที่ติดป้าย “ใช้การ์ดจอ” จะรันได้ทีละงาน</Badge>
          </div>
        </CardBody>
      </GlassCard>
      </div>
      )}
    </div>
  );
}
