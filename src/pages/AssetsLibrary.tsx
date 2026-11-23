import { useCallback, useEffect, useState } from "react";
import { Plus, Wand2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { api, isTauri, pickFiles } from "@/lib/api";
import type { Asset } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/common";
import { AiAssetDialog, AssetEditDialog, AssetGrid } from "@/components/assets";

/** Files shared between the projects of a channel (or every channel). */
export default function AssetsLibrary() {
  const { project, err, notify, confirm } = useApp();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [shared, setShared] = useState(false);
  const [ai, setAi] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const channelId = project?.id ?? null;

  const load = useCallback(async () => {
    try {
      setAssets(await api.assets(channelId));
    } catch (e) {
      err(e);
    }
  }, [channelId, err]);
  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    const paths = await pickFiles();
    if (!paths.length) {
      if (!isTauri) notify("เลือกไฟล์ได้เฉพาะในแอพ (โหมดดูตัวอย่างในเบราว์เซอร์)", "info");
      return;
    }
    try {
      const added = await api.addAssets(paths, shared ? null : channelId);
      await load();
      notify(`เพิ่ม ${added.length} ไฟล์เข้าคลัง`);
    } catch (e) {
      err(e);
    }
  }

  return (
    <div>
      <PageHeader title="Assets library" desc={`ภาพ วิดีโอ เสียง ที่ใช้ร่วมกันได้ทุกโปรเจกต์ของช่อง ${project?.name ?? ""} และไฟล์ที่ตั้งเป็นใช้ได้ทุกช่อง`}>
        <label className="mr-1 flex items-center gap-2 text-[13px] text-muted-foreground" title="ไฟล์ที่เพิ่มใหม่ใช้ได้ทุกช่อง">
          <Switch checked={shared} onCheckedChange={setShared} /> เพิ่มเป็นของทุกช่อง
        </label>
        <Button variant="glass" onClick={() => setAi(true)}>
          <Wand2 /> AI สร้าง
        </Button>
        <Button onClick={add}>
          <Plus /> เพิ่มไฟล์
        </Button>
      </PageHeader>

      <AssetGrid
        assets={assets}
        emptyTitle="คลังยังว่าง"
        emptyDesc="เพิ่มภาพ ฉาก ตัวละคร เสียงประกอบ หรือโลโก้ที่ใช้ซ้ำหลายคลิป ไฟล์อยู่ที่เดิม MumuCut แค่จำตำแหน่งไว้"
        onEdit={setEditing}
        onDelete={async (a) => {
          const ok = await confirm({ title: `เอา ${a.name} ออกจากคลัง?`, desc: "โปรเจกต์ที่ใช้ไฟล์นี้อยู่แล้วยังใช้ต่อได้ ไฟล์บนดิสก์ไม่ถูกลบ", confirmLabel: "เอาออก" });
          if (!ok) return;
          try {
            await api.deleteAsset(a.id);
            await load();
          } catch (e) {
            err(e);
          }
        }}
      />

      <AiAssetDialog
        open={ai}
        onOpenChange={setAi}
        channelId={shared ? null : channelId}
        clipId={null}
        context={project ? `ช่อง ${project.name}: ${project.config.description ?? ""}` : undefined}
        onCreated={() => void load()}
      />
      <AssetEditDialog asset={editing} channelId={channelId} onClose={() => setEditing(null)} onSaved={() => void load()} />
    </div>
  );
}
