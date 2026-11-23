import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Copy, ExternalLink, Link2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { api, openUrl } from "@/lib/api";
import type { AffiliateLink } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Empty, PageHeader } from "@/components/common";
import { LinkDialog, ShopBadge, shops } from "@/components/affiliate";
import { cn } from "@/lib/utils";

/** Every affiliate link in one place; projects pick from here. */
export default function AffiliateLibrary() {
  const { project, err, notify, confirm } = useApp();
  const [links, setLinks] = useState<AffiliateLink[]>([]);
  const [shop, setShop] = useState("all");
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<{ link: AffiliateLink | null } | null>(null);
  const channelId = project?.id ?? null;

  const load = useCallback(async () => {
    try {
      setLinks(await api.affiliates(channelId));
    } catch (e) {
      err(e);
    }
  }, [channelId, err]);
  useEffect(() => {
    void load();
  }, [load]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return links.filter((l) => (shop === "all" || l.platform === shop) && (!s || [l.title, l.url, l.note, l.tags].some((t) => t.toLowerCase().includes(s))));
  }, [links, shop, q]);
  const usedShops = shops.filter((s) => links.some((l) => l.platform === s.id));

  return (
    <div>
      <PageHeader title="Affiliate library" desc="ลิงก์ affiliate จาก Shopee, Lazada, Amazon, G2A และร้านอื่น ใช้ซ้ำได้ทุกโปรเจกต์">
        <Button onClick={() => setDialog({ link: null })}>
          <Plus /> เพิ่มลิงก์
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5">
        <div className="glass-subtle flex rounded-md p-0.5" role="tablist" aria-label="กรองตามร้าน">
          {[{ id: "all", label: "ทั้งหมด" }, ...usedShops].map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={shop === s.id}
              onClick={() => setShop(s.id)}
              className={cn("soft h-8 rounded-sm px-3 text-[13px] font-medium", shop === s.id ? "bg-[var(--glass-bg-strong)] text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {s.label}
              <span className="ml-1.5 text-xs opacity-60">{s.id === "all" ? links.length : links.filter((l) => l.platform === s.id).length}</span>
            </button>
          ))}
        </div>
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาสินค้า ลิงก์ บันทึก" className="pl-9" aria-label="ค้นหาลิงก์" />
        </div>
      </div>

      <GlassCard className="overflow-hidden">
        {list.length === 0 ? (
          <Empty icon={<Link2 />} title={links.length === 0 ? "ยังไม่มีลิงก์" : "ไม่พบลิงก์ที่ตรงกับตัวกรอง"} desc={links.length === 0 ? "วางลิงก์ affiliate ระบบจะเดาร้านจากลิงก์ให้" : undefined}>
            {links.length === 0 && <Button onClick={() => setDialog({ link: null })}><Plus /> เพิ่มลิงก์แรก</Button>}
          </Empty>
        ) : (
          <div className="grid divide-y divide-[var(--glass-hairline)]">
            <div className="grid grid-cols-[120px_1fr_1fr_80px_112px] gap-3 px-5 py-2.5 text-xs font-medium text-muted-foreground">
              <span>ร้าน</span>
              <span>สินค้า</span>
              <span>บันทึก</span>
              <span className="text-right">ใช้ใน</span>
              <span />
            </div>
            {list.map((l, i) => (
              <motion.div key={l.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }} className="grid grid-cols-[120px_1fr_1fr_80px_112px] items-center gap-3 px-5 py-2.5">
                <ShopBadge id={l.platform} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{l.title || "(ไม่มีชื่อ)"}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">{l.url}</span>
                </span>
                <span className="min-w-0">
                  <span className="line-clamp-2 text-[13px] text-muted-foreground">{l.note || "–"}</span>
                  {l.channel_id == null && <Badge tone="success" className="mt-1">ทุกช่อง</Badge>}
                </span>
                <span className="text-right text-[13px] text-muted-foreground">{l.used} คลิป</span>
                <span className="flex justify-end gap-0.5">
                  <Button variant="ghost" size="icon-sm" title="คัดลอกลิงก์" onClick={async () => { await navigator.clipboard.writeText(l.url); notify("คัดลอกลิงก์แล้ว"); }}><Copy /></Button>
                  <Button variant="ghost" size="icon-sm" title="เปิดลิงก์" onClick={() => openUrl(l.url).catch(err)}><ExternalLink /></Button>
                  <Button variant="ghost" size="icon-sm" title="แก้ไข" onClick={() => setDialog({ link: l })}><Pencil /></Button>
                  <Button
                    variant="destructive"
                    size="icon-sm"
                    title="ลบ"
                    onClick={async () => {
                      const ok = await confirm({
                        title: `ลบลิงก์ “${l.title || l.url}”?`,
                        desc: l.used ? `ลิงก์นี้ถูกใช้ใน ${l.used} คลิป จะถูกเอาออกจากคลิปเหล่านั้นด้วย` : "ลบออกจากคลังลิงก์ ย้อนกลับไม่ได้",
                        confirmLabel: "ลบลิงก์",
                      });
                      if (!ok) return;
                      try {
                        await api.deleteAffiliate(l.id);
                        await load();
                      } catch (e) {
                        err(e);
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </GlassCard>

      <LinkDialog open={!!dialog} link={dialog?.link ?? null} channelId={channelId} onClose={() => setDialog(null)} onSaved={() => void load()} />
    </div>
  );
}
