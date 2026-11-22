import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, Download, Palette, RefreshCw, Wrench, X } from "lucide-react";
import { useApp, type Theme } from "@/lib/store";
import { api, isTauri } from "@/lib/api";
import type { ToolStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { CardBody, CardDesc, CardHeader, CardTitle, GlassCard } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
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
      <PageHeader title="ตั้งค่า" desc={isTauri ? "ค่าทั้งหมดเก็บในเครื่องนี้ (SQLite) ส่วน API key เก็บใน Windows Credential Manager" : "โหมดดูตัวอย่างในเบราว์เซอร์ ข้อมูลเป็นตัวอย่าง"} />

      <GlassCard>
        <CardHeader>
          <div className="flex items-center gap-2.5"><Palette className="size-4" /><CardTitle>หน้าตา</CardTitle></div>
        </CardHeader>
        <CardBody className="pt-3">
          <div className="glass-subtle inline-flex rounded-md p-0.5">
            {themes.map((t) => (
              <button key={t.id} onClick={() => setTheme(t.id)} className={cn("soft h-8 rounded-sm px-4 text-[13px] font-medium", theme === t.id ? "bg-[var(--glass-bg-strong)]" : "text-muted-foreground hover:text-foreground")}>
                {t.label}
              </button>
            ))}
          </div>
        </CardBody>
      </GlassCard>

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

      <AgentsCard />

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
            <Field label="พอร์ต ComfyUI"><SaveInput k="comfy_port" placeholder="8188" /></Field>
            <Field label="พอร์ต VoiceStudio"><SaveInput k="voice_port" placeholder="3900" /></Field>
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
  );
}
