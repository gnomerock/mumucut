import { AnimatePresence, motion } from "motion/react";
import { ArrowUpCircle, Clapperboard, FolderCog, Library, LayoutDashboard, Moon, Settings as SettingsIcon, Sun, MonitorCog } from "lucide-react";
import { useApp, type Page, type Theme } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import Dashboard from "@/pages/Dashboard";
import Clips from "@/pages/Clips";
import LibraryPage from "@/pages/Library";
import Projects from "@/pages/Projects";
import SettingsPage from "@/pages/Settings";
import ClipPage from "@/pages/ClipPage";

const nav: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "ภาพรวม", icon: <LayoutDashboard /> },
  { id: "clips", label: "คิวทำคลิป", icon: <Clapperboard /> },
  { id: "library", label: "คลัง", icon: <Library /> },
  { id: "projects", label: "โปรเจกต์", icon: <FolderCog /> },
  { id: "settings", label: "ตั้งค่า", icon: <SettingsIcon /> },
];

const themes: { id: Theme; icon: React.ReactNode; label: string }[] = [
  { id: "light", icon: <Sun />, label: "สว่าง" },
  { id: "system", icon: <MonitorCog />, label: "ตามระบบ" },
  { id: "dark", icon: <Moon />, label: "มืด" },
];

export default function App() {
  const { page, go, clipId, projects, project, setProjectId, theme, setTheme, update } = useApp();
  const showClip = clipId != null && (page === "clips" || page === "library");

  return (
    <>
      <div className="ambient" />
      <div className="flex h-full gap-3 p-3">
        <aside className="glass flex w-[212px] shrink-0 flex-col rounded-xl p-3">
          <div className="flex items-center gap-2.5 px-2 pb-4 pt-1">
            <img src="/icon.png" alt="" className="size-8 rounded-lg" />
            <div className="leading-tight">
              <div className="text-[15px] font-semibold tracking-tight">MumuCut</div>
              <div className="text-[11px] text-muted-foreground">ทำคลิปสั้นแบบมี flow</div>
            </div>
          </div>

          {projects.length > 0 && (
            <div className="px-0.5 pb-3">
              <Select value={String(project?.id ?? "")} onValueChange={(v) => setProjectId(Number(v))}>
                <SelectTrigger className="h-9 text-[13px]">{project?.name}</SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <nav className="grid gap-0.5">
            {nav.map((n) => {
              const active = page === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => go(n.id)}
                  className={cn(
                    "soft relative flex h-9 items-center gap-2.5 rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4",
                    active ? "text-foreground" : "text-muted-foreground hover:bg-[var(--glass-bg-subtle)] hover:text-foreground",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-md bg-[var(--glass-bg-strong)] shadow-sm ring-1 ring-[var(--glass-hairline)]"
                      transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
                    />
                  )}
                  <span className="relative flex items-center gap-2.5">
                    {n.icon}
                    {n.label}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto grid gap-2">
            {update && (
              <button
                onClick={() => go("settings")}
                className="soft glass-subtle flex items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] outline-none hover:bg-[var(--glass-bg)] focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4"
              >
                <ArrowUpCircle className="text-rose" />
                <span className="leading-tight">
                  มีเวอร์ชันใหม่
                  <span className="block text-xs text-muted-foreground">{update.version}</span>
                </span>
              </button>
            )}
            <div className="glass-subtle grid grid-cols-3 gap-0.5 rounded-md p-0.5" role="radiogroup" aria-label="ธีม">
              {themes.map((t) => (
                <button
                  key={t.id}
                  role="radio"
                  aria-checked={theme === t.id}
                  title={t.label}
                  onClick={() => setTheme(t.id)}
                  className={cn(
                    "soft grid h-8 place-items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4",
                    theme === t.id ? "bg-[var(--glass-bg-strong)] text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.icon}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="relative min-w-0 flex-1 overflow-hidden rounded-xl">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={showClip ? `clip-${clipId}` : page}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
              className="h-full overflow-y-auto px-2 pb-6 pt-1"
            >
              {showClip ? (
                <ClipPage />
              ) : page === "dashboard" ? (
                <Dashboard />
              ) : page === "clips" ? (
                <Clips />
              ) : page === "library" ? (
                <LibraryPage />
              ) : page === "projects" ? (
                <Projects />
              ) : (
                <SettingsPage />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </>
  );
}
