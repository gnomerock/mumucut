# MumuCut

โปรแกรมเดสก์ท็อปสำหรับทำคลิปสั้นด้วย flow เดียวกับที่ทำคลิปธรรมะ: เลือกหัวข้อ → เขียนบท (AI) → ทำเสียง → ออกแบบ/สร้างภาพ → จัดหน้า → เรนเดอร์ → ตรวจไฟล์ → แคปชัน (AI) → ลงคลัง → บันทึกโพสต์

**Stack:** Rust + Tauri 2 · React 19 + TypeScript · Tailwind CSS v4 · shadcn/ui (Radix UI) · Motion · SQLite (rusqlite, bundled)
**ฟอนต์ UI:** IBM Plex Sans Thai
**ดีไซน์:** Subtle Glass — blur 16–24 px, ขอบขาวบาง, เงาเบา, สีกลาง (neutral), Light / Dark / ตามระบบ, animation นุ่ม (เคารพ `prefers-reduced-motion`)

## รัน / สร้าง

```powershell
# Node: C:\Users\gnomerock\AppData\Roaming\fnm\node-versions\v24.13.0\installation
npm install
npm run tauri dev        # โหมดพัฒนา
npm run tauri build      # exe + installer ใน src-tauri\target\release\
npm run dev              # ดู UI ในเบราว์เซอร์ด้วยข้อมูลตัวอย่าง (mock) ไม่ใช่ของจริง
cd src-tauri; cargo test # ทดสอบ backend กับ ffmpeg จริงและคลังจริง (อ่านอย่างเดียว)
```

## โครงสร้าง

| ส่วน | ที่อยู่ |
|---|---|
| หน้าจอ (ภาพรวม, คิวทำคลิป, คลัง, โปรเจกต์, ตั้งค่า, หน้า flow ของคลิป) | `src/pages/` |
| Design system (token, `.glass`, `.glass-strong`, `.glass-subtle`) | `src/index.css` |
| คอมโพเนนต์ UI แบบ shadcn | `src/components/ui/` |
| แม่แบบ flow ธรรมะ + ว่าง | `src/lib/templates.ts` |
| ฐานข้อมูล SQLite, ตัวรันขั้นตอน, ffprobe, AI | `src-tauri/src/` (`db.rs`, `runner.rs`, `ffcheck.rs`, `ai.rs`) |

ข้อมูลเก็บที่ `%APPDATA%\app.mumucut\mumucut.db` (ตาราง `settings`, `projects`, `clips`, `steps`, `posts`)
API key เก็บใน Windows Credential Manager ไม่อยู่ในฐานข้อมูล

## Flow และชนิดขั้นตอน

แต่ละโปรเจกต์มีรายการขั้นตอนของตัวเอง (แก้ได้ในหน้า โปรเจกต์ → ขั้นตอน):

| ชนิด | ทำอะไร |
|---|---|
| `pick` | หยิบหัวข้อถัดไปที่ยังไม่ได้ใช้จาก CSV (ข้ามแถวที่เรตติ้งตรงกับคำที่ตั้ง, ไม่หยิบซ้ำกับคลิปที่มีแล้ว) |
| `ai` | ส่ง prompt (แทนตัวแปร `{key} {title} {ref} {brief} {script} {caption} {line_ids}`) ให้ AI, ดึง JSON จากคำตอบ, เขียนลงไฟล์ (`output_file`) หรือรวมเข้าไฟล์ JSON เดิม (`merge_into`), แล้วรันคำสั่งต่อได้ |
| `shell` | สคริปต์ PowerShell ในโฟลเดอร์งาน หนึ่งคำสั่งต่อบรรทัด หยุดทันทีถ้าคำสั่งใดคืนรหัส ≠ 0 แสดง log สด ยกเลิกได้ (ฆ่าทั้ง process tree) |
| `check` | ffprobe + EBU R128: ขนาดภาพ, fps, ความยาว, มีเสียง, LUFS, true peak ตามค่าที่โปรเจกต์ตั้ง |
| `deliver` | คัดลอกวิดีโอ ปก ซับ แคปชัน ลง `โฟลเดอร์คลัง\<รหัส>\` พร้อม `meta.json` แล้วตั้งสถานะ พร้อมโพสต์ |
| `manual` / `post` | กดยืนยันเอง / บันทึกเวลาโพสต์และลิงก์ (กันโพสต์ซ้ำต่อแพลตฟอร์ม) |

- ขั้นตอนที่ติด **ต้องตรวจ** (`gate`) จะหยุดที่สถานะ “รอตรวจ” จนกว่าคนกดอนุมัติ (ตามกฎ: เปิดดูทุกภาพก่อนไปต่อ)
- ขั้นตอนที่ติด **ใช้การ์ดจอ** (`gpu`) รันได้ทีละงาน (GPU 8 GB รัน ComfyUI กับ VoiceStudio พร้อมกันไม่ได้)
- สถานะคลิป: ร่าง · กำลังทำ · พร้อมโพสต์ · ตั้งเวลาแล้ว · โพสต์แล้ว · พักไว้ · ติดปัญหา (พักไว้ = ไม่ถูกโพสต์)

## AI

ตั้งค่า → เลือกอย่างใดอย่างหนึ่ง
- **CLI ที่ล็อกอินไว้แล้ว** (ค่าเริ่มต้น `claude -p`): ส่ง prompt ทาง stdin อ่านคำตอบจาก stdout ไม่แตะข้อมูลล็อกอิน
- **API key**: Anthropic Messages API (ตั้งโมเดล/Base URL ได้)

## ปล่อยเวอร์ชันและอัปเดตอัตโนมัติ

- ทุกครั้งที่ push/merge เข้า `main`, `.github/workflows/release.yml` จะ build บน Windows แล้วสร้าง GitHub Release (แท็ก `v<major>.<minor>.<เลขรัน>`) พร้อมตัวติดตั้ง `.exe`, `.msi`, `MumuCut_portable_x64.exe` และ `latest.json` (ฟีดอัปเดตที่เซ็นชื่อแล้ว)
- แอพที่ติดตั้งแล้วเช็ก `latest.json` ตอนเปิด (ปิดได้ใน ตั้งค่า → อัปเดตแอพ) ถ้ามีเวอร์ชันสูงกว่าจะขึ้นแจ้งที่แถบข้าง กด "ติดตั้งและรีสตาร์ท" แอพดาวน์โหลด ตรวจลายเซ็นกับ public key ที่ฝังไว้ใน `tauri.conf.json` ติดตั้ง แล้วเปิดใหม่ ข้อมูลใน SQLite ไม่ถูกแตะ
- เวอร์ชันของแต่ละ build คือ `major.minor` จาก `tauri.conf.json` บวกเลขรันของ workflow เป็น patch (ถ้าไม่เพิ่มเลข แอพจะไม่เห็นว่ามีเวอร์ชันใหม่) ต้องการขึ้น minor/major ให้แก้ `version` ในไฟล์นั้นเอง
- **ตั้งค่าครั้งเดียว:** สร้าง secret ใน repo (Settings → Secrets and variables → Actions) `TAURI_SIGNING_PRIVATE_KEY` = เนื้อหาไฟล์ private key และ `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = รหัสผ่านของกุญแจ (ว่างถ้าไม่มี) และ Settings → Actions → General → Workflow permissions = Read and write
- **repo ต้องเป็น public:** แอพอ่าน `latest.json` โดยไม่ล็อกอิน repo private จะอัปเดตเองไม่ได้
- ห้ามทำ private key หาย หรือเปลี่ยนกุญแจ: แอพที่ติดตั้งไปแล้วจะรับอัปเดตที่เซ็นด้วยกุญแจใหม่ไม่ได้ ต้องติดตั้งใหม่เอง

## ข้อจำกัดที่ยังไม่ได้ทำ/ตรวจ
- คำสั่งในแม่แบบธรรมะคัดมาจาก `ROUTINE_RUNBOOK.md` แต่ยังไม่เคยรันครบทั้ง flow ผ่านแอพ (voice/ComfyUI/render) — ทดสอบแล้วเฉพาะ runner, AI ผ่าน CLI จำลอง, ffmpeg, ตรวจไฟล์, ลงคลัง, นำเข้าคลัง
- ยังไม่มีขั้นตอนโพสต์อัตโนมัติ (Facebook/YouTube ยังใช้ routine 06:00 เดิม) แอพบันทึกเวลา/ลิงก์ให้เท่านั้น
- ยังไม่มีตัวติดตั้งเครื่องมือภายนอก (ffmpeg, Node, ComfyUI, VoiceStudio) — หน้า ตั้งค่า ตรวจให้ว่ามี/ไม่มี
- เงื่อนไขลิขสิทธิ์ของเครื่องมือ/โมเดล (ffmpeg GPL build, Remotion, SDXL + LoRA, VoiceStudio CC-BY-NC) และเงื่อนไขผู้ให้บริการ AI เรื่องเรียก CLI จากแอพที่แจกจ่าย ยังไม่ได้ตรวจ
