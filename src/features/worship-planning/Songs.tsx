// WO-1 songs vault: the app is the single master song library.
// Tabs: Library (find/sort/filter/saved views) · Needs checking · Duplicates
// · Tags · Export & import (admins). Route: /team-lead/songs (unchanged).
import { Link, useSearchParams } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/ui";
import Library from "./songs/Library";
import NeedsChecking from "./songs/NeedsChecking";
import Duplicates from "./songs/Duplicates";
import TagManager from "./songs/TagManager";
import ImportExport from "./songs/ImportExport";
import { useSongLibrary } from "./songs/data";

type Tab = "library" | "check" | "duplicates" | "tags" | "data";

export default function Songs() {
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "library";
  const { data: songs } = useSongLibrary();
  const openChecks = (songs ?? []).reduce((n, s) => n + s.openReviews, 0);
  const active = (songs ?? []).filter((s) => s.is_active).length;

  const go = (t: Tab, extra?: Record<string, string>) => {
    const p = new URLSearchParams(t === "library" ? {} : { tab: t });
    for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v);
    setParams(p);
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "library", label: "Library" },
    { id: "check", label: "Needs checking", count: openChecks },
    { id: "duplicates", label: "Duplicates" },
    { id: "tags", label: "Tags" },
    ...(isAdmin ? [{ id: "data" as Tab, label: "Export & import" }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <PageHeader
          back="/team-lead"
          title="Songs"
          subtitle={songs ? `${active} active songs · the master library` : undefined}
          action={
            <Link to="/team-lead/songs/insights" className="btn-secondary">
              <BarChart3 size={16} /> <span className="hidden sm:inline">Insights</span>
            </Link>
          }
        />
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1" role="tablist" aria-label="Song library sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`chip min-h-[40px] whitespace-nowrap shrink-0 ${tab === t.id ? "bg-accent text-white dark:text-brand-ink" : "bg-raised text-soft hover:text-ink"}`}
              onClick={() => go(t.id)}
            >
              {t.label}
              {!!t.count && (
                <span className={`rounded-full px-1.5 text-[11px] ${tab === t.id ? "bg-white/25" : "bg-warning-soft text-warning"}`}>{t.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === "library" && <Library />}
      {tab === "check" && <NeedsChecking />}
      {tab === "duplicates" && <Duplicates />}
      {tab === "tags" && <TagManager onShowTag={(tag) => go("library", { f: JSON.stringify({ tags: [tag] }) })} />}
      {tab === "data" && <ImportExport />}
    </div>
  );
}
