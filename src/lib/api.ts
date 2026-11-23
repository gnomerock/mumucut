import { invoke as tauriInvoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  Agent, TestResult, Asset, AffiliateLink, ClipAffiliate, SocialAccount, ProviderStatus,
  Clip, ClipDetail, LogEvent, Post, Project, Settings, Stats, StatusEvent, StepRow, StepStatus, ToolStatus,
} from "./types";
import { mockInvoke } from "./mock";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) return tauriInvoke<T>(cmd, args);
  return mockInvoke<T>(cmd, args);
}

export const api = {
  settings: () => call<Settings>("get_settings"),
  setSetting: (key: string, value: string) => call<void>("set_setting", { key, value }),
  agents: () => call<Agent[]>("list_agents"),
  saveAgent: (agent: Agent) => call<Agent>("save_agent", { agent }),
  deleteAgent: (id: number) => call<void>("delete_agent", { id }),
  setDefaultAgent: (id: number) => call<void>("set_default_agent", { id }),
  setAgentKey: (id: number, key: string) => call<void>("set_agent_key", { id, key }),
  clearAgentKey: (id: number) => call<void>("clear_agent_key", { id }),
  testAgent: (id: number) => call<TestResult>("test_agent", { id }),
  runFlow: (clipId: number) => call<string>("run_flow", { clipId }),
  checkTools: () => call<ToolStatus[]>("check_tools"),

  projects: () => call<Project[]>("list_projects"),
  saveProject: (project: Project) => call<Project>("save_project", { project }),
  deleteProject: (id: number) => call<void>("delete_project", { id }),

  clips: (projectId?: number | null) => call<Clip[]>("list_clips", { projectId: projectId ?? null }),
  clipDetail: (id: number) => call<ClipDetail>("get_clip_detail", { id }),
  createClip: (projectId: number) => call<Clip>("create_clip", { projectId }),
  updateClip: (id: number, patch: Partial<Omit<Clip, "id">>) => call<Clip>("update_clip", { id, patch }),
  deleteClip: (id: number) => call<void>("delete_clip", { id }),
  importLibrary: (projectId: number) => call<number>("import_library", { projectId }),

  runStep: (clipId: number, stepKey: string) => call<StepRow>("run_step", { clipId, stepKey }),
  cancelStep: (clipId: number, stepKey: string) => call<boolean>("cancel_step", { clipId, stepKey }),
  setStepStatus: (clipId: number, stepKey: string, status: StepStatus) =>
    call<StepRow>("set_step_status", { clipId, stepKey, status }),
  resetSteps: (clipId: number) => call<void>("reset_steps", { clipId }),
  runningSteps: () => call<[number, string][]>("running_steps"),

  posts: (clipId?: number | null) => call<Post[]>("list_posts", { clipId: clipId ?? null }),
  addPost: (clipId: number, platform: string, scheduledAt: string, url: string, note: string) =>
    call<Post[]>("add_post", { clipId, platform, scheduledAt, url, note }),
  updatePost: (id: number, status: string, url?: string) => call<void>("update_post", { id, status, url: url ?? null }),
  deletePost: (id: number) => call<void>("delete_post", { id }),

  stats: () => call<Stats>("get_stats"),
  readText: (path: string) => call<string>("read_text_file", { path }),
  writeText: (path: string, content: string) => call<void>("write_text_file", { path, content }),
  pathExists: (path: string) => call<boolean>("path_exists", { path }),
  resolvePath: (workdir: string, rel: string, key: string) =>
    call<string>("resolve_project_path", { workdir, rel, key }),
  ensureDir: (path: string) => call<void>("ensure_dir", { path }),

  assets: (channelId: number | null, clipId?: number | null) => call<Asset[]>("list_assets", { channelId, clipId: clipId ?? null }),
  addAssets: (paths: string[], channelId: number | null, clipId?: number | null) =>
    call<Asset[]>("add_assets", { paths, channelId, clipId: clipId ?? null }),
  updateAsset: (asset: Asset) => call<Asset>("update_asset", { asset }),
  deleteAsset: (id: number) => call<void>("delete_asset", { id }),
  useLibraryAsset: (assetId: number, clipId: number) => call<Asset>("use_library_asset", { assetId, clipId }),
  shareAsset: (assetId: number) => call<Asset>("share_asset", { assetId }),
  generateAsset: (channelId: number | null, clipId: number | null, kind: "image" | "speech" | "sfx", prompt: string) =>
    call<Asset>("generate_asset", { channelId, clipId, kind, prompt }),

  affiliates: (channelId?: number | null) => call<AffiliateLink[]>("list_affiliates", { channelId: channelId ?? null }),
  saveAffiliate: (link: AffiliateLink) => call<AffiliateLink>("save_affiliate", { link }),
  deleteAffiliate: (id: number) => call<void>("delete_affiliate", { id }),
  clipAffiliates: (clipId: number) => call<ClipAffiliate[]>("list_clip_affiliates", { clipId }),
  attachAffiliate: (clipId: number, linkId: number, placement: string) => call<void>("attach_affiliate", { clipId, linkId, placement }),
  detachAffiliate: (clipId: number, linkId: number) => call<void>("detach_affiliate", { clipId, linkId }),

  accounts: (channelId?: number | null) => call<SocialAccount[]>("list_accounts", { channelId: channelId ?? null }),
  saveAccount: (account: SocialAccount) => call<SocialAccount>("save_account", { account }),
  deleteAccount: (id: number) => call<void>("delete_account", { id }),
  setAccountToken: (id: number, token: string) => call<void>("set_account_token", { id, token }),
  clearAccountToken: (id: number) => call<void>("clear_account_token", { id }),

  providerStatus: (channelId: number | null) => call<ProviderStatus[]>("provider_status", { channelId }),
  setProviderKey: (id: string, key: string) => call<void>("set_provider_key", { id, key }),
  clearProviderKey: (id: string) => call<void>("clear_provider_key", { id }),
  runInstaller: (id: string, channelId: number | null) => call<string>("run_installer", { id, channelId }),
  testComfyMcp: () => call<string>("test_comfy_mcp"),

  openStudio: (channelId: number) => call<string>("open_studio", { channelId }),
  aiWrite: (prompt: string, agentId?: string) => call<string>("ai_write", { prompt, agentId: agentId ?? null }),
};

export async function pickFiles(filters?: { name: string; extensions: string[] }[]): Promise<string[]> {
  if (!isTauri) return [];
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ multiple: true, directory: false, filters });
  return Array.isArray(r) ? r : typeof r === "string" ? [r] : [];
}

export async function openUrl(url: string) {
  if (!isTauri) {
    window.open(url, "_blank", "noopener");
    return;
  }
  const { openUrl: ou } = await import("@tauri-apps/plugin-opener");
  await ou(url);
}

/** Folder that holds new channels: Settings → ทั่วไป → ที่เก็บโปรเจกต์, else Documents\MumuCut. */
export async function projectsRoot(custom?: string): Promise<string> {
  if (custom?.trim()) return custom.trim();
  if (!isTauri) return "C:\\Users\\you\\Documents\\MumuCut";
  const { documentDir, join } = await import("@tauri-apps/api/path");
  return join(await documentDir(), "MumuCut");
}

export async function defaultChannelDir(name: string, root?: string): Promise<string> {
  const safe = name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, "-") || "channel";
  const base = await projectsRoot(root);
  return `${base.replace(/[\\/]+$/, "")}\\${safe}`;
}

/** file path -> URL the webview can load (asset protocol) */
export function fileUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  return isTauri ? convertFileSrc(path) : undefined;
}

export async function openPath(path: string) {
  if (!isTauri) return;
  const { openPath: op } = await import("@tauri-apps/plugin-opener");
  await op(path);
}

export async function revealPath(path: string) {
  if (!isTauri) return;
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}

export async function pickFolder(): Promise<string | null> {
  if (!isTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ directory: true, multiple: false });
  return typeof r === "string" ? r : null;
}

export function onLog(cb: (e: LogEvent) => void) {
  if (!isTauri) return Promise.resolve(() => {});
  return listen<LogEvent>("step-log", (e) => cb(e.payload));
}
export function onStatus(cb: (e: StatusEvent) => void) {
  if (!isTauri) return Promise.resolve(() => {});
  return listen<StatusEvent>("step-status", (e) => cb(e.payload));
}
