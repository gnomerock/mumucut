import type { Update } from "@tauri-apps/plugin-updater";
import { isTauri } from "./api";

export interface UpdateInfo {
  version: string;
  notes?: string;
  date?: string;
}

let pending: Update | null = null;

export async function currentVersion(): Promise<string> {
  if (!isTauri) return "dev";
  return (await import("@tauri-apps/api/app")).getVersion();
}

/** Ask the release feed (latest.json on GitHub) whether a newer, signed build exists. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isTauri) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  try {
    pending = await check();
  } catch (e) {
    const raw = typeof e === "string" ? e : (e as Error)?.message ?? "";
    throw new Error(`เช็กเวอร์ชันใหม่ไม่ได้: ยังไม่มี Release บน GitHub, repo ยังเป็น private หรือไม่มีอินเทอร์เน็ต (${raw})`);
  }
  return pending ? { version: pending.version, notes: pending.body ?? undefined, date: pending.date ?? undefined } : null;
}

/** Download, verify the signature, install, then restart. onProgress gets 0 to 100 (null when the size is unknown). */
export async function installUpdate(onProgress: (pct: number | null) => void): Promise<void> {
  if (!pending) throw new Error("ยังไม่ได้ตรวจหาเวอร์ชันใหม่");
  let total = 0;
  let got = 0;
  await pending.downloadAndInstall((e) => {
    if (e.event === "Started") total = e.data.contentLength ?? 0;
    else if (e.event === "Progress") {
      got += e.data.chunkLength;
      onProgress(total ? Math.min(100, Math.round((got / total) * 100)) : null);
    } else if (e.event === "Finished") onProgress(100);
  });
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
