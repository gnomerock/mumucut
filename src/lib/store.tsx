import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { api } from "./api";
import type { Clip, Project, Settings, Stats } from "./types";

export type Page = "dashboard" | "clips" | "library" | "projects" | "settings";
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
  openClip: (id: number | null) => void;
  projects: Project[];
  project: Project | null;
  setProjectId: (id: number) => void;
  clips: Clip[];
  stats: Stats | null;
  settings: Settings;
  setSetting: (k: string, v: string) => Promise<void>;
  theme: Theme;
  setTheme: (t: Theme) => void;
  refresh: () => Promise<void>;
  notify: (text: string, tone?: Toast["tone"]) => void;
  err: (e: unknown) => void;
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
  root.classList.toggle("dark", dark);
  window.setTimeout(() => root.classList.remove("theme-fade"), 450);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [page, setPage] = useState<Page>("dashboard");
  const [clipId, setClipId] = useState<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setPid] = useState<number | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [settings, setSettings] = useState<Settings>({});
  const [theme, setThemeState] = useState<Theme>((localStorage.getItem("theme") as Theme) || "system");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 7000 : 3200);
  }, []);
  const err = useCallback((e: unknown) => notify(typeof e === "string" ? e : (e as Error)?.message ?? "เกิดข้อผิดพลาด", "error"), [notify]);

  const refresh = useCallback(async () => {
    try {
      const [p, s, st] = await Promise.all([api.projects(), api.settings(), api.stats()]);
      setProjects(p);
      setSettings(s);
      setStats(st);
      const pid = projectId && p.some((x) => x.id === projectId) ? projectId : p[0]?.id ?? null;
      setPid(pid);
      setClips(await api.clips(pid));
    } catch (e) {
      err(e);
    }
  }, [projectId, err]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      openClip: (id) => {
        setClipId(id);
        if (id != null && page !== "clips" && page !== "library") setPage("clips");
      },
      projects,
      project: projects.find((p) => p.id === projectId) ?? null,
      setProjectId: (id) => {
        setPid(id);
        api.clips(id).then(setClips).catch(err);
      },
      clips,
      stats,
      settings,
      setSetting: async (k, v) => {
        await api.setSetting(k, v);
        setSettings((s) => ({ ...s, [k]: v }));
      },
      theme,
      setTheme,
      refresh,
      notify,
      err,
    }),
    [page, clipId, projects, projectId, clips, stats, settings, theme, setTheme, refresh, notify, err],
  );

  return (
    <AppCtx.Provider value={value}>
      {children}
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
              className="glass-strong pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-lg px-4 py-3 text-sm"
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
