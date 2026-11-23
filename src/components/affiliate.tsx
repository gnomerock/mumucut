import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { api } from "@/lib/api";
import type { AffiliateLink } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const shops: { id: string; label: string; color: string }[] = [
  { id: "shopee", label: "Shopee", color: "#EE4D2D" },
  { id: "lazada", label: "Lazada", color: "#0F146D" },
  { id: "amazon", label: "Amazon", color: "#FF9900" },
  { id: "g2a", label: "G2A", color: "#F05F00" },
  { id: "tiktok", label: "TikTok Shop", color: "#111111" },
  { id: "aliexpress", label: "AliExpress", color: "#E43225" },
  { id: "other", label: "อื่น ๆ", color: "#6B7280" },
];

export const shopOf = (id: string) => shops.find((s) => s.id === id) ?? shops[shops.length - 1];

/** Guess the shop from the link's host. */
export function guessShop(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("shopee") || u.includes("shp.ee")) return "shopee";
  if (u.includes("lazada") || u.includes("lzd.co")) return "lazada";
  if (u.includes("amazon") || u.includes("amzn.")) return "amazon";
  if (u.includes("g2a")) return "g2a";
  if (u.includes("tiktok")) return "tiktok";
  if (u.includes("aliexpress") || u.includes("s.click.ali")) return "aliexpress";
  return "other";
}

export function ShopBadge({ id }: { id: string }) {
  const s = shopOf(id);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--foreground)_7%,transparent)] px-2.5 py-0.5 text-xs font-medium">
      <span className="size-2 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

const blank = (channelId: number | null): AffiliateLink => ({ id: 0, channel_id: channelId, platform: "shopee", title: "", url: "", note: "", tags: "", created_at: "", used: 0 });

export function LinkDialog({
  open, link, channelId, onClose, onSaved,
}: {
  open: boolean;
  link: AffiliateLink | null;
  channelId: number | null;
  onClose: () => void;
  onSaved: (l: AffiliateLink) => void;
}) {
  const { err } = useApp();
  const [l, setL] = useState<AffiliateLink>(link ?? blank(null));
  const [platformTouched, setPlatformTouched] = useState(false);
  useEffect(() => {
    if (open) {
      setL(link ?? blank(null));
      setPlatformTouched(!!link);
    }
  }, [open, link]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <div>
          <DialogTitle>{l.id ? "แก้ไขลิงก์ affiliate" : "เพิ่มลิงก์ affiliate"}</DialogTitle>
          <DialogDescription>ลิงก์อยู่ในคลังกลาง ใช้ซ้ำได้หลายโปรเจกต์</DialogDescription>
        </div>
        <Field label="ลิงก์">
          <Input
            autoFocus
            value={l.url}
            placeholder="https://s.shopee.co.th/…"
            className="font-mono text-[13px]"
            onChange={(e) => {
              const url = e.target.value;
              setL({ ...l, url, platform: platformTouched ? l.platform : guessShop(url) });
            }}
          />
        </Field>
        <div className="grid grid-cols-[180px_1fr] gap-4">
          <Field label="ร้าน/แพลตฟอร์ม">
            <Select value={l.platform} onValueChange={(v) => { setPlatformTouched(true); setL({ ...l, platform: v }); }}>
              <SelectTrigger>{shopOf(l.platform).label}</SelectTrigger>
              <SelectContent>{shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="ชื่อสินค้า"><Input value={l.title} onChange={(e) => setL({ ...l, title: e.target.value })} /></Field>
        </div>
        <Field label="บันทึก" hint="เช่น ใส่เฉพาะ Facebook, ค่าคอม 8%, หมดเขต 31 ธ.ค.">
          <Textarea rows={2} value={l.note} onChange={(e) => setL({ ...l, note: e.target.value })} />
        </Field>
        <Field label="แท็ก" hint="คั่นด้วยจุลภาค"><Input value={l.tags} onChange={(e) => setL({ ...l, tags: e.target.value })} /></Field>
        {channelId != null && (
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={l.channel_id == null} onCheckedChange={(v) => setL({ ...l, channel_id: v ? null : channelId })} />
            ใช้ได้ทุกช่อง
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button
            disabled={!l.url.trim()}
            onClick={async () => {
              try {
                const saved = await api.saveAffiliate(l);
                onSaved(saved);
                onClose();
              } catch (e) {
                err(e);
              }
            }}
          >
            บันทึก
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function placementLabel(p: string) {
  return p
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => ({ facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", x: "X", youtube: "YouTube" })[s] ?? s)
    .join(", ");
}

export function cnRow(i: number) {
  return cn(i > 0 && "border-t border-[var(--glass-hairline)]");
}
