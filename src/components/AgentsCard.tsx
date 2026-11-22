import { useState } from "react";
import { Bot, Check, FlaskConical, KeyRound, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import type { Agent } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CardBody, CardDesc, CardHeader, CardTitle, GlassCard } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

export const providers: { id: string; label: string; hint: string; flow: boolean; api: boolean }[] = [
  { id: "claude", label: "Claude Code (subscription)", hint: "ใช้ claude ที่ล็อกอินไว้ในเครื่อง ไม่ต้องใช้ API key", flow: true, api: false },
  { id: "codex", label: "Codex CLI", hint: "ใช้ codex ที่ล็อกอินไว้ในเครื่อง", flow: false, api: false },
  { id: "custom", label: "CLI อื่น (ตั้งคำสั่งเอง)", hint: "โปรแกรมใดก็ได้ที่รับ prompt ทาง stdin และตอบทาง stdout", flow: true, api: false },
  { id: "anthropic-api", label: "Anthropic API", hint: "เรียก Messages API ด้วยคีย์ของคุณ", flow: false, api: true },
  { id: "openai-api", label: "OpenAI compatible API", hint: "OpenAI, OpenRouter, Ollama, LM Studio และเซิร์ฟเวอร์ที่ใช้รูปแบบเดียวกัน", flow: false, api: true },
];
export const providerLabel = (id: string) => providers.find((p) => p.id === id)?.label ?? id;
const efforts = ["low", "medium", "high", "xhigh", "max"];
const DEFAULT = "default";

const blank = (): Agent => ({
  id: 0, name: "", title: "", description: "", provider: "claude", model: "", effort: "", instructions: "", command: "", api_base: "", is_default: false, has_key: false,
});

export default function AgentsCard() {
  const { agents, refreshAgents, err, notify } = useApp();
  const [edit, setEdit] = useState<Agent | null>(null);
  const [tests, setTests] = useState<Record<number, { busy?: boolean; ok?: boolean; text?: string }>>({});

  async function test(a: Agent) {
    setTests((t) => ({ ...t, [a.id]: { busy: true } }));
    try {
      const r = await api.testAgent(a.id);
      setTests((t) => ({ ...t, [a.id]: { ok: r.ok, text: r.ok ? `ตอบ “${r.answer}” ใน ${(r.ms / 1000).toFixed(1)} วินาที` : r.answer } }));
    } catch (e) {
      setTests((t) => ({ ...t, [a.id]: { ok: false, text: String(e) } }));
    }
  }

  return (
    <GlassCard>
      <CardHeader>
        <div>
          <div className="flex items-center gap-2.5">
            <Bot className="size-4" />
            <CardTitle>AI agents</CardTitle>
          </div>
          <CardDesc className="mt-1">agent คือผู้ช่วยหนึ่งตัว มีชื่อ บทบาท ผู้ให้บริการ โมเดล และคำสั่งประจำตัว ตัวที่ตั้งเป็นค่าเริ่มต้นจะคุม flow ของทุกโปรเจกต์ ถ้าโปรเจกต์ไม่ได้เลือกตัวอื่น</CardDesc>
        </div>
        <Button size="sm" variant="glass" onClick={() => setEdit(blank())}>
          <Plus /> เพิ่ม agent
        </Button>
      </CardHeader>
      <CardBody className="grid gap-2.5">
        {agents.map((a) => {
          const t = tests[a.id];
          const pv = providers.find((p) => p.id === a.provider);
          return (
            <div key={a.id} className="glass-subtle grid gap-2 rounded-md px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{a.name}</span>
                    {a.is_default && <Badge tone="success">ค่าเริ่มต้น</Badge>}
                    <Badge>{providerLabel(a.provider)}</Badge>
                    {a.model && <Badge>{a.model}</Badge>}
                    <Badge tone={pv?.flow ? "info" : "neutral"}>{pv?.flow ? "คุมทั้ง flow ได้" : "เขียนข้อความอย่างเดียว"}</Badge>
                  </div>
                  {(a.title || a.description) && (
                    <div className="mt-1 text-[13px] text-muted-foreground">
                      {a.title}
                      {a.title && a.description ? ": " : ""}
                      {a.description}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" disabled={t?.busy} onClick={() => test(a)}>
                    <FlaskConical /> ทดสอบ
                  </Button>
                  {!a.is_default && (
                    <Button variant="ghost" size="icon-sm" title="ตั้งเป็นค่าเริ่มต้น" onClick={async () => { try { await api.setDefaultAgent(a.id); await refreshAgents(); } catch (e) { err(e); } }}>
                      <Star />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon-sm" title="แก้ไข" onClick={() => setEdit({ ...a })}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon-sm"
                    title="ลบ"
                    onClick={async () => {
                      if (!window.confirm(`ลบ agent “${a.name}”?`)) return;
                      try {
                        await api.deleteAgent(a.id);
                        await refreshAgents();
                      } catch (e) {
                        err(e);
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              {t && (
                <div className={t.busy ? "text-[13px] text-muted-foreground" : t.ok ? "flex items-center gap-1.5 text-[13px] text-success" : "flex items-start gap-1.5 text-[13px] text-rose"}>
                  {t.busy ? "กำลังทดสอบ (ถามหนึ่งคำถามสั้น ๆ)" : t.ok ? <Check className="mt-0.5 size-3.5 shrink-0" /> : <X className="mt-0.5 size-3.5 shrink-0" />}
                  <span className="whitespace-pre-wrap break-words">{t.text}</span>
                </div>
              )}
            </div>
          );
        })}
      </CardBody>
      <EditDialog
        agent={edit}
        onClose={() => setEdit(null)}
        onSaved={async (a) => {
          await refreshAgents();
          notify(`บันทึก agent ${a.name} แล้ว`);
        }}
      />
    </GlassCard>
  );
}

function EditDialog({ agent, onClose, onSaved }: { agent: Agent | null; onClose: () => void; onSaved: (a: Agent) => Promise<void> }) {
  const { err } = useApp();
  const [a, setA] = useState<Agent>(blank());
  const [key, setKey] = useState("");
  const [seed, setSeed] = useState<Agent | null>(null);
  if (agent !== seed) {
    setSeed(agent);
    if (agent) {
      setA(agent);
      setKey("");
    }
  }
  const pv = providers.find((p) => p.id === a.provider) ?? providers[0];
  const set = (patch: Partial<Agent>) => setA((x) => ({ ...x, ...patch }));

  async function save() {
    try {
      const saved = await api.saveAgent({ ...a, name: a.name.trim() });
      if (pv.api && key.trim()) await api.setAgentKey(saved.id, key.trim());
      await onSaved(saved);
      onClose();
    } catch (e) {
      err(e);
    }
  }

  return (
    <Dialog open={agent != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(720px,94vw)]">
        <div>
          <DialogTitle>{a.id ? `แก้ไข ${agent?.name ?? ""}` : "agent ใหม่"}</DialogTitle>
          <DialogDescription>{pv.hint}</DialogDescription>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="ชื่อ">
            <Input value={a.name} onChange={(e) => set({ name: e.target.value })} placeholder="Editor" />
          </Field>
          <Field label="บทบาท">
            <Input value={a.title} onChange={(e) => set({ title: e.target.value })} placeholder="ผู้คุมงานทั้ง flow" />
          </Field>
        </div>
        <Field label="คำอธิบาย">
          <Input value={a.description} onChange={(e) => set({ description: e.target.value })} placeholder="ทำอะไรบ้าง" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="ผู้ให้บริการ" hint={pv.flow ? "คุมทั้ง flow ได้ (ใช้เครื่องมือของ MumuCut ผ่าน MCP)" : "ใช้กับขั้นตอนเขียนข้อความ ยังคุมทั้ง flow ไม่ได้"}>
            <Select value={a.provider} onValueChange={(v) => set({ provider: v })}>
              <SelectTrigger>{providerLabel(a.provider)}</SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="โมเดล" hint="เว้นว่างเพื่อใช้ค่าเริ่มต้นของโปรแกรม">
            <Input value={a.model} onChange={(e) => set({ model: e.target.value })} className="font-mono text-[13px]" placeholder={a.provider === "claude" ? "claude-sonnet-5-5" : a.provider === "anthropic-api" ? "claude-sonnet-5-5" : a.provider === "openai-api" ? "gpt-5" : ""} />
          </Field>
        </div>
        {a.provider === "claude" && (
          <Field label="ระดับความพยายาม (effort)">
            <Select value={a.effort || DEFAULT} onValueChange={(v) => set({ effort: v === DEFAULT ? "" : v })}>
              <SelectTrigger>{a.effort || "ค่าเริ่มต้นของ Claude Code"}</SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT}>ค่าเริ่มต้นของ Claude Code</SelectItem>
                {efforts.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        {a.provider === "custom" && (
          <Field label="คำสั่ง CLI" hint="รับ prompt ทาง stdin และตอบทาง stdout ถ้าจะให้คุมทั้ง flow โปรแกรมต้องอ่าน MUMUCUT_MCP_URL และ MUMUCUT_MCP_TOKEN แล้วคุยแบบ MCP เอง">
            <Input value={a.command} onChange={(e) => set({ command: e.target.value })} className="font-mono text-[13px]" placeholder="mytool --stdin" />
          </Field>
        )}
        {pv.api && (
          <>
            <Field label="Base URL" hint="เว้นว่างเพื่อใช้ของผู้ให้บริการเอง">
              <Input value={a.api_base} onChange={(e) => set({ api_base: e.target.value })} className="font-mono text-[13px]" placeholder={a.provider === "openai-api" ? "https://api.openai.com/v1" : "https://api.anthropic.com"} />
            </Field>
            <Field label="API key" hint={a.has_key ? "มีคีย์เก็บไว้ใน Windows Credential Manager แล้ว (ไม่แสดงกลับมา) พิมพ์คีย์ใหม่เพื่อเปลี่ยน" : "ยังไม่ได้ตั้ง คีย์เก็บใน Windows Credential Manager ไม่อยู่ในฐานข้อมูล"}>
              <div className="flex gap-2">
                <Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={a.has_key ? "••••••••••••" : "sk-…"} />
                {a.has_key && a.id > 0 && (
                  <Button
                    variant="glass"
                    onClick={async () => {
                      try {
                        await api.clearAgentKey(a.id);
                        set({ has_key: false });
                      } catch (e) {
                        err(e);
                      }
                    }}
                  >
                    <KeyRound /> ลบคีย์
                  </Button>
                )}
              </div>
            </Field>
          </>
        )}
        <Field label="คำสั่งประจำตัว (instructions)" hint="ข้อความที่ agent ได้รับทุกครั้งก่อนงานจริง เช่น น้ำเสียง กติกาช่อง สิ่งที่ห้ามทำ">
          <Textarea rows={5} value={a.instructions} onChange={(e) => set({ instructions: e.target.value })} placeholder="ตอบเป็นภาษาไทย เสียงผู้ชาย ลงท้ายด้วย ครับ" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button onClick={save} disabled={!a.name.trim()}>
            บันทึก
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
