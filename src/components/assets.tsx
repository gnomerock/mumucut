import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, AudioLines, File, FolderOpen, Image as ImageIcon, Pencil, Search, Sparkles, Trash2, Video, Wand2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { api, fileUrl, revealPath } from "@/lib/api";
import type { Asset, AssetKind } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Empty } from "@/components/common";
import { cn } from "@/lib/utils";

export const kindMeta: Record<AssetKind, { label: string; icon: React.ReactNode }> = {
  image: { label: "ภาพ", icon: <ImageIcon /> },
  video: { label: "วิดีโอ", icon: <Video /> },
  audio: { label: "เสียง", icon: <AudioLines /> },
  file: { label: "ไฟล์", icon: <File /> },
};

export function AssetGrid({
  assets, emptyTitle, emptyDesc, actions, onEdit, onDelete,
}: {
  assets: Asset[];
  emptyTitle: string;
  emptyDesc?: string;
  actions?: (a: Asset) => React.ReactNode;
  onEdit?: (a: Asset) => void;
  onDelete?: (a: Asset) => void;
}) {
  const [kind, setKind] = useState<AssetKind | "all">("all");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return assets.filter((a) => (kind === "all" || a.kind === kind) && (!s || [a.name, a.tags, a.note].some((t) => t.toLowerCase().includes(s))));
  }, [assets, kind, q]);

  return (
    <div className="grid gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="glass-subtle flex rounded-md p-0.5" role="tablist" aria-label="ชนิดไฟล์">
          {(["all", "image", "video", "audio", "file"] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={cn("soft h-8 rounded-sm px-3 text-[13px] font-medium", kind === k ? "bg-[var(--glass-bg-strong)] text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {k === "all" ? "ทั้งหมด" : kindMeta[k].label}
              <span className="ml-1.5 text-xs opacity-60">{k === "all" ? assets.length : assets.filter((a) => a.kind === k).length}</span>
            </button>
          ))}
        </div>
        <div className="relative w-60">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ แท็ก" className="pl-9" aria-label="ค้นหา assets" />
        </div>
      </div>
      {list.length === 0 ? (
        <div className="glass rounded-lg">
          <Empty icon={<ImageIcon />} title={assets.length === 0 ? emptyTitle : "ไม่พบไฟล์ที่ตรงกับตัวกรอง"} desc={assets.length === 0 ? emptyDesc : undefined} />
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          {list.map((a, i) => (
            <motion.div key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.02 }} className="glass group overflow-hidden rounded-lg">
              <AssetPreview a={a} />
              <div className="grid gap-1 px-3 pb-2 pt-2.5">
                <div className="truncate text-[13px] font-medium" title={a.path}>{a.name}</div>
                <div className="flex flex-wrap items-center gap-1">
                  <Badge className="[&_svg]:size-3">{kindMeta[a.kind]?.icon}{kindMeta[a.kind]?.label}</Badge>
                  {a.source === "ai" && <Badge tone="info"><Sparkles className="size-3" />AI</Badge>}
                  {a.source === "library" && <Badge>จากคลัง</Badge>}
                  {a.clip_id == null && a.channel_id == null && <Badge tone="success">ทุกช่อง</Badge>}
                  {!a.exists && <Badge tone="danger"><AlertTriangle className="size-3" />ไม่พบไฟล์</Badge>}
                </div>
                {(a.tags || a.note) && <div className="line-clamp-2 text-xs text-muted-foreground">{a.tags || a.note}</div>}
              </div>
              <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
                {actions?.(a)}
                <span className="flex-1" />
                <Button variant="ghost" size="icon-sm" title="เปิดโฟลเดอร์" onClick={() => revealPath(a.path)} disabled={!a.exists}><FolderOpen /></Button>
                {onEdit && <Button variant="ghost" size="icon-sm" title="แก้ไข" onClick={() => onEdit(a)}><Pencil /></Button>}
                {onDelete && <Button variant="destructive" size="icon-sm" title="เอาออก (ไฟล์บนดิสก์ไม่ถูกลบ)" onClick={() => onDelete(a)}><Trash2 /></Button>}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function AssetPreview({ a }: { a: Asset }) {
  const url = a.exists ? fileUrl(a.path) : undefined;
  return (
    <div className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-[linear-gradient(160deg,var(--muted),transparent)]">
      {url && a.kind === "image" ? (
        <img src={url} alt={a.name} className="size-full object-contain" loading="lazy" />
      ) : url && a.kind === "video" ? (
        <video src={url} className="size-full object-contain" muted preload="metadata" controls />
      ) : url && a.kind === "audio" ? (
        <div className="grid w-full gap-2 px-3">
          <AudioLines className="mx-auto size-8 text-muted-foreground/70" />
          <audio src={url} controls className="h-8 w-full" preload="none" />
        </div>
      ) : (
        <div className="text-muted-foreground/60 [&_svg]:size-8">{kindMeta[a.kind]?.icon}</div>
      )}
    </div>
  );
}

type GenKind = "image" | "speech" | "sfx";
const GEN_LABEL: Record<GenKind, string> = { image: "ภาพ", speech: "เสียงพูด", sfx: "เสียงประกอบ" };
/** provider ids (Settings → AI providers) that can make each kind */
const GEN_PROVIDERS: Record<GenKind, string[]> = { image: ["comfyui", "openai-image", "custom-image"], speech: ["voicestudio", "elevenlabs", "custom-audio"], sfx: ["elevenlabs"] };
const PROMPT_HELP: Record<GenKind, string> = {
  image: "เขียน prompt ภาษาอังกฤษสำหรับสร้างภาพ 1 ภาพ บรรยายวัตถุ ฉาก แสง และสไตล์ ไม่เกิน 60 คำ ตอบเฉพาะ prompt",
  speech: "เขียนข้อความภาษาไทยที่จะให้เสียงพากย์อ่าน สั้น กระชับ ตอบเฉพาะข้อความ",
  sfx: "เขียนคำอธิบายเสียงประกอบภาษาอังกฤษ 1 ประโยค เช่น soft temple bell ringing in the distance ตอบเฉพาะคำอธิบาย",
};

/** Ask the asset tools from Settings to make an image or a sound; AI can draft the prompt from the clip's context. */
export function AiAssetDialog({
  open, onOpenChange, channelId, clipId, context, onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  channelId: number | null;
  clipId: number | null;
  context?: string;
  onCreated: (a: Asset) => void;
}) {
  const { err, notify, go } = useApp();
  const [kind, setKind] = useState<GenKind>("image");
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const [prompt, setPrompt] = useState("");
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const configured = (GEN_PROVIDERS[kind] ?? []).some((id) => ready[id]);
  useEffect(() => {
    if (!open) {
      setBusy(false);
      return;
    }
    api.providerStatus(channelId).then((s) => setReady(Object.fromEntries(s.map((x) => [x.id, x.ok])))).catch(() => {});
  }, [open, channelId]);

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <div>
          <DialogTitle className="flex items-center gap-2"><Wand2 className="size-4" /> AI ช่วยสร้าง asset</DialogTitle>
          <DialogDescription>ใช้ผู้ให้บริการที่เลือกไว้ใน Settings → AI providers (โมเดลหลัก) ไฟล์ที่ได้จะเข้ารายการนี้ทันที</DialogDescription>
        </div>
        <div className="glass-subtle inline-flex w-fit rounded-md p-0.5">
          {(["image", "speech", "sfx"] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)} className={cn("soft flex h-8 items-center gap-1.5 rounded-sm px-4 text-[13px] font-medium [&_svg]:size-3.5", kind === k ? "bg-[var(--glass-bg-strong)]" : "text-muted-foreground hover:text-foreground")}>
              {kindMeta[k === "image" ? "image" : "audio"].icon}
              {GEN_LABEL[k]}
            </button>
          ))}
        </div>
        {!configured && (
          <div className="glass-subtle flex items-center justify-between gap-3 rounded-md px-3.5 py-2.5 text-[13px]">
            <span>ยังไม่ได้เชื่อมผู้ให้บริการสร้าง{GEN_LABEL[kind]}</span>
            <Button size="sm" variant="glass" onClick={() => { onOpenChange(false); go("settings"); }}>ไปที่ Settings</Button>
          </div>
        )}
        <Field label="อยากได้อะไร (ไม่บังคับ)" hint="พิมพ์ไอเดียสั้น ๆ แล้วให้ AI เขียน prompt เต็มให้">
          <div className="flex gap-2">
            <Input value={idea} onChange={(e) => setIdea(e.target.value)} placeholder={kind === "image" ? "เช่น ดอกบัวกระดาษพับบนน้ำตอนเช้า" : kind === "sfx" ? "เช่น เสียงระฆังวัดดังไกล ๆ" : "เช่น ประโยคเปิดคลิป"} />
            <Button
              variant="glass"
              disabled={drafting || (!idea.trim() && !context)}
              onClick={async () => {
                setDrafting(true);
                try {
                  setPrompt(await api.aiWrite(`${PROMPT_HELP[kind]}\n\nบริบทของคลิป:\n${context || "-"}\n\nไอเดีย: ${idea || "(เลือกจากบริบท)"}`));
                } catch (e) {
                  err(e);
                } finally {
                  setDrafting(false);
                }
              }}
            >
              <Sparkles className={cn(drafting && "animate-pulse")} /> เขียน prompt
            </Button>
          </div>
        </Field>
        <Field label={kind === "image" ? "Prompt ภาพ" : kind === "sfx" ? "คำอธิบายเสียงประกอบ (ภาษาอังกฤษได้ผลดีกว่า)" : "ข้อความที่ให้อ่าน"}>
          <Textarea rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>ปิด</Button>
          <Button
            disabled={busy || !prompt.trim() || !configured}
            onClick={async () => {
              setBusy(true);
              try {
                const a = await api.generateAsset(channelId, clipId, kind, prompt);
                onCreated(a);
                notify(`สร้าง ${a.name} แล้ว`);
                onOpenChange(false);
                setPrompt("");
                setIdea("");
              } catch (e) {
                err(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Wand2 className={cn(busy && "animate-spin")} /> {busy ? "กำลังสร้าง…" : "สร้าง"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AssetEditDialog({ asset, channelId, onClose, onSaved }: { asset: Asset | null; channelId: number | null; onClose: () => void; onSaved: () => void }) {
  const { err } = useApp();
  const [a, setA] = useState<Asset | null>(asset);
  useEffect(() => setA(asset), [asset]);
  return (
    <Dialog open={!!asset} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>แก้ไข asset</DialogTitle>
        {a && (
          <>
            <Field label="ชื่อ"><Input value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} /></Field>
            <Field label="แท็ก" hint="คั่นด้วยจุลภาค"><Input value={a.tags} onChange={(e) => setA({ ...a, tags: e.target.value })} /></Field>
            <Field label="บันทึก / prompt"><Textarea rows={3} value={a.note} onChange={(e) => setA({ ...a, note: e.target.value })} /></Field>
            {a.clip_id == null && (
              <label className="flex items-center gap-3 text-sm">
                <Switch checked={a.channel_id == null} onCheckedChange={(v) => setA({ ...a, channel_id: v ? null : channelId })} />
                ใช้ได้ทุกช่อง (ไม่ใช่เฉพาะช่องนี้)
              </label>
            )}
            <p className="break-all font-mono text-xs text-muted-foreground">{a.path}</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
              <Button
                onClick={async () => {
                  try {
                    await api.updateAsset(a);
                    onSaved();
                    onClose();
                  } catch (e) {
                    err(e);
                  }
                }}
              >
                บันทึก
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
