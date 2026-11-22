import type { ProjectConfig, StepDef } from "./types";

const step = (s: Partial<StepDef> & { key: string; label: string; kind: StepDef["kind"] }): StepDef => ({
  desc: "",
  cmd: "",
  prompt: "",
  output_file: "",
  merge_into: "",
  gate: false,
  gpu: false,
  preview: "",
  ...s,
});

/** Text style defaults agreed for every clip: no dark box, stroke 10, shadow 20, white + red rose only. */
export const defaultText = (font = "Playpen Sans Thai") => ({
  font,
  stroke: 10,
  shadow: 20,
  white: "#FFFFFF",
  rose: "#E11D48",
  safe: { left: 120, right: 959, top: 127, bottom: 1682 },
});

const SCRIPT_PROMPT = `คุณคือคนเขียนบทคลิปสั้นช่อง "ธรรมะสำหรับผู้สูงอายุ" (ผู้พูดเป็นผู้ชาย ลงท้ายด้วย ครับ)
หัวข้อ: {ref} — {title}
ต้นฉบับ (อังกฤษ Sujato สาธารณสมบัติ + ร่างถอดความไทย):
{brief}

เขียนบท 5 บรรทัด ความยาวพูดรวมประมาณ 22–27 วินาที:
1) คำถามเปิดเรื่อง 1 บรรทัด
2–4) เนื้อคาถาด้วยถ้อยคำไทยของเราเอง 2–3 บรรทัด (ห้ามคัดลอกคำแปลไทยที่ตีพิมพ์ เช่นฉบับมหาจุฬา)
5) ประโยคปิดของเรา 1 บรรทัด
ห้ามมีภาพหรือคำที่เกี่ยวกับพระพุทธรูปหรือภาพพระสงฆ์

ตอบเป็น JSON อย่างเดียว ไม่มีคำอธิบาย ตามรูปแบบนี้:
{"id":"{key}","title":"{title}","ref":"{ref}","head":36,"lines":[{"text":"…","emphasis":["คำเน้น"],"sub":"บรรทัด1/บรรทัด2|หน้าถัดไป"}]}
กติกา sub: "|" แบ่งหน้าซับ "/" แบ่ง 2 บรรทัดในหน้าเดียว ประมาณ 20 ตัวอักษรต่อบรรทัด และตัวอักษรที่ไม่นับช่องว่างต้องเท่ากับ text`;

const ASSETS_PROMPT = `ออกแบบภาพชุดใหม่สำหรับคลิป {key} "{title}" ({ref}) แนวหนังสือป๊อปอัป กระดาษพับ
บท: {script}

ต้องมี: ตัวละครหลัก (ฆราวาสสูงอายุหรือเด็กเท่านั้น ห้ามพระ ห้ามพระพุทธรูป) 3 ท่าที่หน้าตาเสื้อผ้าเหมือนกัน และพร็อพ/ฉาก 3 ชิ้นที่เข้ากับคาถา
ตอบเป็น JSON array อย่างเดียว: [["pu_{key}_man_stop","ประโยคอธิบายวัตถุ (อังกฤษ)",[832,1216],[11,12]], ...]
ตัวละครยืน = [832,1216] พร้อม seed 2 ตัว, พร็อพ = [1024,1024]; อธิบายวัตถุเรียบ ๆ และเขียนว่า "only the object, no background shapes"`;

const COMPOSE_PROMPT = `วางหน้าหนังสือป๊อปอัปสำหรับ {key} "{title}" บท: {script}
ตอบเป็น JSON object อย่างเดียวมีสองคีย์: "pals" (พาเลตสีต่อบรรทัด {table,floor,wallTop,wallBot,amb,key,hemi:[sky,ground],glow,cover:[c1,c2]} สีพาสเทลถึงกลาง ไม่ซ้ำ 3 คลิปล่าสุด) และ "pieces" (รายการชิ้นงานต่อบรรทัด ชนิด cut/hill/wave/sun/cloud/wind)
x อยู่ -1.05..1.05, z 0..2.4, ตัวละครหลักต้องอยู่ทุกบรรทัด, เว้นส่วนล่างหนึ่งในสามไว้ให้ซับไตเติล`;

const CAPTION_PROMPT = `เขียนแคปชันโพสต์สำหรับคลิป {key} "{title}" ({ref}) บท: {script}
แคปชัน = คำถามเปิด, เนื้อคาถาด้วยถ้อยคำของเรา, คำถามง่าย ๆ ให้คนคอมเมนต์, ประโยคขอกดติดตาม ลงท้าย ครับ (ไม่ใส่บรรทัดที่มา ไม่ใส่แฮชแท็ก)
ตอบเป็น JSON อย่างเดียว: {"caption":"…","tags":"#ธรรมะ #ธรรมบท … (5–6 แท็ก)"}`;

export const dhammaConfig = (_library = ""): ProjectConfig => ({
  width: 1080,
  height: 1920,
  fps: 30,
  max_seconds: 30,
  lufs_min: -16.5,
  lufs_max: -13,
  peak_max: -1,
  video_file: "out/{key}.mp4",
  cover_file: "out/covers/{key}_cover.jpg",
  extra_files: [`../04_clips/transcripts/{key}*.srt`, `../04_clips/transcripts/{key}*.vtt`, `../04_clips/transcripts/{key}*_transcript.txt`],
  pool: {
    csv: "../01_content/quotes_candidates*.csv",
    ref_col: 1,
    title_col: 3,
    brief_cols: [4, 5],
    used_col: 9,
    rating_col: 6,
    skip_rating: "ละเอียดอ่อน",
    ref_prefix: "ธรรมบท คาถาที่ ",
  },
  text: defaultText("Sarabun"),
  steps: [
    step({ key: "pick", label: "เลือกหัวข้อ", kind: "pick", desc: "หยิบคาถาถัดไปที่ยังไม่ได้ใช้จากคลังหัวข้อ (ข้ามหัวข้อละเอียดอ่อน)" }),
    step({
      key: "script",
      label: "เขียนบท",
      kind: "ai",
      desc: "AI เขียนบท 5 บรรทัดเป็น JSON แล้วสร้างไฟล์หน้าหนังสือ",
      prompt: SCRIPT_PROMPT,
      output_file: "popspec/{key}_text.json",
      cmd: "python scripts\\popup_add_episode.py popspec\\{key}_text.json",
    }),
    step({
      key: "voice",
      label: "ทำเสียง",
      kind: "shell",
      gpu: true,
      desc: "VoiceStudio โปรไฟล์ Gnomerock ความเร็ว 0.92 แล้วรวมเป็นไทม์ไลน์ (ต้องไม่เกิน 885 เฟรม)",
      cmd: [
        "powershell -File D:\\short-clips\\comfy-workflows\\start_voicestudio.ps1",
        "python scripts\\vs_gen.py {line_ids}",
        "python scripts\\vs_to_vo.py {line_ids}",
        "node scripts\\build-timeline.mjs",
      ].join("\n"),
    }),
    step({
      key: "assets_spec",
      label: "ออกแบบภาพ",
      kind: "ai",
      desc: "AI กำหนดภาพใหม่: ตัวละคร 3 ท่า + พร็อพ 3 ชิ้น",
      prompt: ASSETS_PROMPT,
      output_file: "popspec/{key}_assets.json",
    }),
    step({
      key: "assets",
      label: "สร้างภาพ",
      kind: "shell",
      gpu: true,
      gate: true,
      desc: "ComfyUI สร้างภาพ แล้วซิงก์เข้าโปรเจกต์ — เปิดดูทุกภาพก่อนกดอนุมัติ (ไม่เอาภาพที่มีวัตถุแปลกปลอม มือเพี้ยน)",
      cmd: [
        "powershell -File D:\\short-clips\\comfy-workflows\\start_comfy.ps1",
        "python D:\\short-clips\\comfy-workflows\\gen_popup_assets.py --jobs popspec\\{key}_assets.json",
        "powershell -File D:\\short-clips\\comfy-workflows\\stop_gpu.ps1",
        "python D:\\short-clips\\comfy-workflows\\sync_popup.py",
      ].join("\n"),
    }),
    step({
      key: "compose",
      label: "จัดหน้า",
      kind: "ai",
      gate: true,
      desc: "AI วางสี/ชิ้นงานแต่ละหน้า → สร้างดนตรี → ภาพนิ่ง 8 เฟรมเพื่อตรวจก่อน render",
      prompt: COMPOSE_PROMPT,
      merge_into: "popspec/{key}_text.json",
      cmd: ["python scripts\\popup_add_episode.py popspec\\{key}_text.json", "node scripts\\make-music.mjs", "python scripts\\pop_qa.py {key}"].join("\n"),
      preview: "out/popstills/{key}_sheet.jpg",
    }),
    step({
      key: "render",
      label: "เรนเดอร์",
      kind: "shell",
      gate: true,
      desc: "Remotion เรนเดอร์ 1–2 นาทีต่อคลิป แล้วทำภาพปก",
      cmd: ['& "C:\\Program Files\\Git\\bin\\bash.exe" scripts/render_one.sh {key}', "node scripts\\cover_still.mjs {key}"].join("\n"),
      preview: "out/covers/{key}_cover.jpg",
    }),
    step({ key: "check", label: "ตรวจไฟล์", kind: "check", desc: "ffprobe + ความดัง: 1080×1920, 30 fps, ≤30 วิ, ประมาณ −14 ถึง −16 LUFS, พีค ≤ −1 dBFS" }),
    step({
      key: "caption",
      label: "แคปชัน",
      kind: "ai",
      desc: "AI เขียนแคปชัน + แฮชแท็ก",
      prompt: CAPTION_PROMPT,
      output_file: "popspec/{key}_deliver.json",
    }),
    step({ key: "deliver", label: "ลงคลัง", kind: "deliver", desc: "คัดลอกวิดีโอ ปก ซับ แคปชัน เข้าโฟลเดอร์คลัง แล้วตั้งสถานะ พร้อมโพสต์" }),
    step({ key: "post", label: "ตั้งโพสต์", kind: "post", desc: "บันทึกเวลาโพสต์/ลิงก์ของแต่ละแพลตฟอร์ม (ไม่โพสต์ซ้ำ)" }),
  ],
});

export const blankConfig = (): ProjectConfig => ({
  width: 1080,
  height: 1920,
  fps: 30,
  max_seconds: 30,
  lufs_min: -16.5,
  lufs_max: -13,
  peak_max: -1,
  video_file: "out/{key}.mp4",
  cover_file: "out/covers/{key}_cover.jpg",
  extra_files: [],
  pool: { csv: "", ref_col: 0, title_col: 1, brief_cols: [], used_col: -1, rating_col: -1, skip_rating: "", ref_prefix: "" },
  text: defaultText(),
  steps: [
    step({ key: "idea", label: "ไอเดีย/หัวข้อ", kind: "manual", desc: "ใส่หัวข้อในแท็บ ข้อมูล แล้วกดยืนยัน" }),
    step({ key: "script", label: "เขียนบท", kind: "ai", desc: "AI เขียนบท", prompt: "เขียนบทคลิปสั้นไม่เกิน 30 วินาทีเรื่อง {title}\n{brief}\nตอบเป็น JSON อย่างเดียว", output_file: "{key}_script.json" }),
    step({ key: "voice", label: "ทำเสียง", kind: "shell", gpu: true, desc: "ใส่คำสั่งทำเสียงของคุณ (หนึ่งคำสั่งต่อบรรทัด)" }),
    step({ key: "assets", label: "ภาพ", kind: "shell", gpu: true, gate: true, desc: "ใส่คำสั่งสร้างภาพ" }),
    step({ key: "render", label: "เรนเดอร์", kind: "shell", gate: true, desc: "ใส่คำสั่ง render ให้ได้ไฟล์ตาม video_file" }),
    step({ key: "check", label: "ตรวจไฟล์", kind: "check", desc: "ตรวจขนาด เฟรมเรต ความยาว ความดัง" }),
    step({ key: "deliver", label: "ลงคลัง", kind: "deliver", desc: "คัดลอกเข้าโฟลเดอร์คลัง" }),
    step({ key: "post", label: "ตั้งโพสต์", kind: "post", desc: "บันทึกเวลาโพสต์" }),
  ],
});

export interface Template {
  id: string;
  name: string;
  desc: string;
  workdir: string;
  library: string;
  prefix: string;
  config: () => ProjectConfig;
}

export const templates: Template[] = [
  {
    id: "dhamma",
    name: "ธรรมะผู้สูงอายุ (หนังสือป๊อปอัป)",
    desc: "flow เดียวกับที่ทำอยู่: เลือกคาถา → บท → เสียง → ภาพ → จัดหน้า → render → ตรวจ → ลงคลัง → โพสต์",
    workdir: "D:\\short-clips\\dhamma-elders\\video",
    library: "D:\\short-clips\\library\\dhamma",
    prefix: "EP",
    config: () => dhammaConfig("D:\\short-clips\\library\\dhamma"),
  },
  {
    id: "blank",
    name: "ว่าง (ตั้งเอง)",
    desc: "8 ขั้นตอนพื้นฐานให้ใส่คำสั่งของคุณเอง",
    workdir: "",
    library: "",
    prefix: "CL",
    config: blankConfig,
  },
];

