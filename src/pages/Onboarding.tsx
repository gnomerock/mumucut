import { motion } from "motion/react";
import { FileText, FolderKanban, Layers, Send, Tv } from "lucide-react";
import { ChannelWizard } from "@/components/ChannelWizard";

const flow = [
  { icon: <Tv />, title: "ช่อง", desc: "แต่ละช่องมีสไตล์ flow และบัญชีโซเชียลของตัวเอง" },
  { icon: <FolderKanban />, title: "โปรเจกต์คลิป", desc: "หนึ่งโปรเจกต์ = หนึ่งคลิป บอกว่าคลิปนี้เล่าเรื่องอะไร" },
  { icon: <FileText />, title: "Scripts → Assets → Editor", desc: "เขียนบท เตรียมภาพเสียง แล้วสร้างคลิป" },
  { icon: <Send />, title: "Affiliate → Publish", desc: "แนบลิงก์ขายของ แล้วโพสต์ลงทุกแพลตฟอร์ม" },
];

/** First launch: no channel yet, so the only thing to do is create one. */
export default function Onboarding() {
  return (
    <div className="grid h-full place-items-center overflow-y-auto p-6">
      <div className="grid w-full max-w-[980px] grid-cols-[1fr_1.15fr] gap-5">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="flex flex-col justify-center gap-6 px-2">
          <div className="flex items-center gap-3">
            <img src="/icon.png" alt="" className="size-12 rounded-xl" />
            <div>
              <h1 className="text-[26px] font-semibold leading-tight tracking-tight">ยินดีต้อนรับสู่ MumuCut</h1>
              <p className="text-sm text-muted-foreground">ทำคลิปสั้นเป็นระบบ ตั้งแต่บทจนโพสต์</p>
            </div>
          </div>
          <ol className="grid gap-3">
            {flow.map((f, i) => (
              <motion.li
                key={f.title}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.06 }}
                className="glass-subtle flex items-start gap-3 rounded-lg px-4 py-3"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-foreground/8 [&_svg]:size-4">{f.icon}</span>
                <span>
                  <span className="block text-sm font-semibold">{f.title}</span>
                  <span className="block text-[13px] text-muted-foreground">{f.desc}</span>
                </span>
              </motion.li>
            ))}
          </ol>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Layers className="size-3.5" /> คลัง assets และลิงก์ affiliate ใช้ร่วมกันได้ทุกโปรเจกต์
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 }} className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold tracking-tight">สร้างช่องแรกของคุณ</h2>
          <p className="mb-5 text-sm text-muted-foreground">ใช้เวลาไม่ถึงนาที เพิ่มช่องอื่นได้ภายหลังจากเมนูช่องด้านซ้าย</p>
          <ChannelWizard first />
        </motion.div>
      </div>
    </div>
  );
}
