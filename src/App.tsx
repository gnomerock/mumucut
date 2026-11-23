import { AnimatePresence, motion } from "motion/react";
import { ArrowUpCircle, Check, ChevronsUpDown, FolderKanban, Images, Link2, Moon, MonitorCog, Plus, Settings as SettingsIcon, SlidersHorizontal, Sun } from "lucide-react";
import { useApp, type Page, type Theme } from "@/lib/store";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ChannelAvatar, Skeleton } from "@/components/common";
import { ChannelWizard } from "@/components/ChannelWizard";
import ProjectsPage from "@/pages/Projects";
import ProjectPage from "@/pages/ProjectPage";
import AssetsLibrary from "@/pages/AssetsLibrary";
import AffiliateLibrary from "@/pages/AffiliateLibrary";
import ChannelSettings from "@/pages/ChannelSettings";
import SettingsPage from "@/pages/Settings";
import Onboarding from "@/pages/Onboarding";

const nav: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: "projects", label: "Projects", icon: <FolderKanban /> },
  { id: "assets", label: "Assets library", icon: <Images /> },
  { id: "affiliates", label: "Affiliate library", icon: <Link2 /> },
  { id: "settings", label: "Settings", icon: <SettingsIcon /> },
];

const themes: { id: Theme; icon: React.ReactNode; label: string }[] = [
  { id: "light", icon: <Sun />, label: "สว่าง" },
  { id: "system", icon: <MonitorCog />, label: "ตามระบบ" },
  { id: "dark", icon: <Moon />, label: "มืด" },
];

export default function App() {
  const { page, go, clipId, projects, loading, theme, setTheme, update, wizardOpen, setWizardOpen } = useApp();

  if (loading)
    return (
      <div className="grid h-full place-items-center">
        <div className="ambient" />
        <Skeleton className="h-10 w-48" />
      </div>
    );

  if (projects.length === 0)
    return (
      <>
        <div className="ambient" />
        <Onboarding />
      </>
    );

  const showProject = page === "projects" && clipId != null;
  const key = showProject ? `clip-${clipId}` : page;

  return (
    <>
      <div className="ambient" />
      <div className="flex h-full gap-3 p-3">
        <aside className="glass flex w-[228px] shrink-0 flex-col rounded-xl p-3">
          <div className="flex items-center gap-2.5 px-2 pb-3 pt-1">
            <img src="/icon.png" alt="" className="size-8 rounded-lg" />
            <div className="leading-tight">
              <div className="text-[15px] font-semibold tracking-tight">MumuCut</div>
              <div className="text-[11px] text-muted-foreground">ทำคลิปสั้นแบบมี flow</div>
            </div>
          </div>

          <ChannelSwitcher />

          <nav className="mt-3 grid gap-0.5" aria-label="เมนูหลัก">
            {nav.map((n) => {
              const active = page === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => go(n.id)}
                  aria-current={active ? "page" : undefined}
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
              key={key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
              className="h-full overflow-y-auto px-2 pb-6 pt-1"
            >
              {showProject ? (
                <ProjectPage />
              ) : page === "projects" ? (
                <ProjectsPage />
              ) : page === "assets" ? (
                <AssetsLibrary />
              ) : page === "affiliates" ? (
                <AffiliateLibrary />
              ) : page === "channel" ? (
                <ChannelSettings />
              ) : (
                <SettingsPage />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="w-[min(680px,94vw)]">
          <div>
            <DialogTitle>สร้างช่องใหม่</DialogTitle>
            <DialogDescription>ช่องใหม่มีโปรเจกต์คลิป บัญชีโซเชียล และการตั้งค่า flow แยกจากช่องอื่น</DialogDescription>
          </div>
          {wizardOpen && <ChannelWizard onDone={() => setWizardOpen(false)} onCancel={() => setWizardOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ChannelSwitcher() {
  const { projects, project, setProjectId, go, setWizardOpen, clips } = useApp();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="soft glass-subtle flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none hover:bg-[var(--glass-bg)] focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="เลือกช่อง"
        >
          <ChannelAvatar name={project?.name ?? "?"} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-[11px] text-muted-foreground">ช่อง</span>
            <span className="block truncate text-sm font-semibold">{project?.name ?? "เลือกช่อง"}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[260px]">
        <DropdownMenuLabel>ช่องทั้งหมด ({projects.length})</DropdownMenuLabel>
        {projects.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onSelect={() => {
              setProjectId(p.id);
              go("projects");
            }}
          >
            <ChannelAvatar name={p.name} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{p.name}</span>
              {p.config.description && <span className="block truncate text-xs text-muted-foreground">{p.config.description}</span>}
            </span>
            {p.id === project?.id && (
              <>
                <span className="text-xs text-muted-foreground">{clips.length}</span>
                <Check className="text-foreground" />
              </>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setWizardOpen(true)}>
          <Plus /> สร้างช่องใหม่
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => go("channel")} disabled={!project}>
          <SlidersHorizontal /> ตั้งค่าช่องนี้
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
