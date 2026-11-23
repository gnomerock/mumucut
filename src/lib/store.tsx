import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "./api";
import type { Agent, Clip, Project, Settings, Stats } from "./types";
import { checkForUpdate, type UpdateInfo } from "./updater";

/** projects = clip projects of the selected channel; channel = settings of the selected channel */
export type Page = "projects" | "assets" | "affiliates" | "settings" | "channel";
export type ProjectTab = "scripts" | "assets" | "editor" | "affiliate" | "publish";
/** "last" = the page (and project tab) that was open when the app closed */
export type OpenTo = "projects" | "last" | "assets" | "affiliates" | "settings";
export type Lang = "system" | "th" | "en";
export type Theme = "light" | "dark" | "system";

interface Toast {
  id: number;
  tone: "ok" | "error" | "info";
  text: string;
}

interface Ctx {
  page: Page;
  go: (p: Page) => void;
  clipId: number | null;
  openClip: (id: number | null, tab?: ProjectTab) => void;
  tab: ProjectTab;
  setTab: (t: ProjectTab) => void;
  wizardOpen: boolean;
  setWizardOpen: (o: boolean) => void;
  projects: Project[];
  project: Project | null;
  setProjectId: (id: number) => void;
  clips: Clip[];
  loading: boolean;
  agents: Agent[];
  refreshAgents: () => Promise<void>;
  stats: Stats | null;
  settings: Settings;
  setSetting: (k: string, v: string) => Promise<void>;
  theme: Theme;
  setTheme: (t: Theme) => void;
  update: UpdateInfo | null;
  checkUpdate: (manual?: boolean) => Promise<UpdateInfo | null>;
  refresh: () => Promise<void>;
  notify: (text: string, tone?: Toast["tone"]) => void;
  err: (e: unknown) => void;
  /** In-app confirmation dialog; resolves true only when the user presses the confirm button. */
  confirm: (o: ConfirmOptions) => Promise<boolean>;
}

export interface ConfirmOptions {
  title: string;
  desc?: string;
  confirmLabel?: string;
  /** "danger" = red confirm button (delete) */
  tone?: "danger" | "default";
}

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
};

function applyTheme(t: Theme) {
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.classList.add("theme-fade");
  root.dataset.mode = dark ? "dark" : "light";
  window.setTimeout(() => root.classList.remove("theme-fade"), 450);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  // where the app opens (Settings → ทั่วไป → เปิดแอปที่): read synchronously so there is no flash of another page
  const openTo = (localStorage.getItem("open_to") as OpenTo) || "projects";
  const last = openTo === "last";
  const [page, setPage] = useState<Page>(() => {
    const p = (last ? localStorage.getItem("last_page") : openTo) as Page | null;
    return p && ["projects", "assets", "affiliates", "settings", "channel"].includes(p) ? p : "projects";
  });
  const [clipId, setClipId] = useState<number | null>(() => (last ? Number(localStorage.getItem("last_clip")) || null : null));
  const [tab, setTab] = useState<ProjectTab>(() => (last ? (localStorage.getItem("last_tab") as ProjectTab) || "scripts" : "scripts"));
  useEffect(() => {
    localStorage.setItem("last_page", page);
    localStorage.setItem("last_clip", clipId == null ? "" : String(clipId));
    localStorage.setItem("last_tab", tab);
  }, [page, clipId, tab]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setPidState] = useState<number | null>(() => Number(localStorage.getItem("channel")) || null);
  // refresh() reads the latest choice from the ref, so a channel picked just before a refresh is kept
  const pidRef = useRef<number | null>(projectId);
  const setPid = useCallback((id: number | null) => {
    pidRef.current = id;
    setPidState(id);
    if (id != null) localStorage.setItem("channel", String(id));
  }, []);
  const [clips, setClips] = useState<Clip[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [theme, setThemeState] = useState<Theme>((localStorage.getItem("theme") as Theme) || "system");
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ask, setAsk] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);

  // window.confirm does not block inside Tauri (the dialog plugin makes it async), so deletes use this instead
  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setAsk({ ...o, resolve });
      }),
    [],
  );
  const answer = (ok: boolean) => {
    ask?.resolve(ok);
    setAsk(null);
  };

  const notify = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 7000 : 3200);
  }, []);
  const err = useCallback((e: unknown) => notify(typeof e === "string" ? e : (e as Error)?.message ?? "เกิดข้อผิดพลาด", "error"), [notify]);

  const refresh = useCallback(async () => {
    try {
      const [p, s, st, ag] = await Promise.all([api.projects(), api.settings(), api.stats(), api.agents()]);
      setProjects(p);
      setAgents(ag);
      setSettings(s);
      setStats(st);
      const want = pidRef.current;
      const pid = want && p.some((x) => x.id === want) ? want : p[0]?.id ?? null;
      setPid(pid);
      const cl = await api.clips(pid);
      setClips(cl);
      // a remembered project that is gone (deleted, other channel) must not open
      setClipId((cur) => (cur != null && !cl.some((c) => c.id === cur) ? null : cur));
    } catch (e) {
      err(e);
    } finally {
      setLoading(false);
    }
  }, [err, setPid]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkUpdate = useCallback(
    async (manual = false) => {
      try {
        const u = await checkForUpdate();
        setUpdate(u);
        if (manual) notify(u ? `มีเวอร์ชันใหม่ ${u.version}` : "ใช้เวอร์ชันล่าสุดอยู่แล้ว", u ? "info" : "ok");
        return u;
      } catch (e) {
        // a silent check at start-up must never nag (offline, no release yet)
        if (manual) err(e);
        return null;
      }
    },
    [notify, err],
  );

  const settingsLoaded = Object.keys(settings).length > 0;
  useEffect(() => {
    if (!settingsLoaded || settings.auto_update === "0") return;
    const t = window.setTimeout(() => void checkUpdate(false), 4000);
    return () => window.clearTimeout(t);
    // once, after the settings have loaded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded]);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = () => applyTheme("system");
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem("theme", t);
    setThemeState(t);
    void api.setSetting("theme", t);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      page,
      go: (p) => {
        setPage(p);
        setClipId(null);
      },
      clipId,
      openClip: (id, t) => {
        setClipId(id);
        if (id != null) {
          setTab(t ?? "scripts");
          setPage("projects");
        }
      },
      tab,
      setTab,
      wizardOpen,
      setWizardOpen,
      projects,
      project: projects.find((p) => p.id === projectId) ?? null,
      setProjectId: (id) => {
        setPid(id);
        setClipId(null);
        api.clips(id).then(setClips).catch(err);
      },
      clips,
      loading,
      agents,
      refreshAgents: async () => setAgents(await api.agents()),
      stats,
      settings,
      setSetting: async (k, v) => {
        await api.setSetting(k, v);
        setSettings((s) => ({ ...s, [k]: v }));
      },
      theme,
      setTheme,
      update,
      checkUpdate,
      refresh,
      notify,
      err,
      confirm,
    }),
    [confirm, update, checkUpdate, page, clipId, tab, wizardOpen, projects, projectId, setPid, clips, loading, agents, stats, settings, theme, setTheme, refresh, notify, err],
  );

  return (
    <AppCtx.Provider value={value}>
      {children}
      <Dialog open={!!ask} onOpenChange={(o) => !o && answer(false)}>
        <DialogContent className="w-[min(440px,92vw)]" onOpenAutoFocus={(e) => e.preventDefault()}>
          <div className="flex items-start gap-3 pr-6">
            {ask?.tone !== "default" && (
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-rose/15 text-rose">
                <AlertTriangle className="size-4" />
              </span>
            )}
            <div className="grid gap-1">
              <DialogTitle>{ask?.title}</DialogTitle>
              {ask?.desc && <DialogDescription className="whitespace-pre-line">{ask.desc}</DialogDescription>}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="glass" autoFocus onClick={() => answer(false)}>
              ยกเลิก
            </Button>
            <Button variant={ask?.tone === "default" ? "default" : "rose"} onClick={() => answer(true)}>
              {ask?.confirmLabel ?? "ลบ"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <div className="pointer-events-none fixed bottom-5 right-5 z-[60] grid gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
              className="solid pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-lg px-4 py-3 text-sm"
            >
              {t.tone === "ok" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : t.tone === "error" ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose" /> : <Info className="mt-0.5 size-4 shrink-0" />}
              <span className="whitespace-pre-wrap break-words">{t.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </AppCtx.Provider>
  );
}
