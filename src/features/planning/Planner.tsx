// WO-3 monthly planner. Tabs: Month plan · Import availability · Team list · Rules.
// Route: /team-lead/planner (team leads and admins; RLS enforces it).
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/ui";
import { todayISO } from "@/lib/format";
import MonthPlan from "./MonthPlan";
import MonthGrid from "./MonthGrid";
import ImportAvailability from "./ImportAvailability";
import TeamList from "./TeamList";
import RulesEditor from "./RulesEditor";
import { shiftMonth } from "./data";

type Tab = "plan" | "grid" | "import" | "team" | "rules";

export default function Planner() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "plan";
  const month = /^\d{4}-\d{2}$/.test(params.get("m") ?? "") ? params.get("m")! : shiftMonth(todayISO().slice(0, 7), 1);

  const go = (t: Tab, m = month) => {
    const p = new URLSearchParams();
    if (t !== "plan") p.set("tab", t);
    p.set("m", m);
    setParams(p);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "plan", label: "Month plan" },
    { id: "grid", label: "Month grid" },
    { id: "import", label: "Import availability" },
    { id: "team", label: "Team list" },
    { id: "rules", label: "Rules" },
  ];

  return (
    <div className="space-y-4">
      <div className="print:hidden"><PageHeader back="/team-lead" title="Planner" subtitle="Build the month's rota from the availability form." /></div>
      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 print:hidden" role="tablist" aria-label="Planner sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`chip min-h-[40px] whitespace-nowrap shrink-0 ${tab === t.id ? "bg-accent text-white dark:text-brand-ink" : "bg-raised text-soft hover:text-ink"}`}
            onClick={() => go(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "plan" && <MonthPlan month={month} setMonth={(m) => go("plan", m)} />}
      {tab === "grid" && <MonthGrid month={month} setMonth={(m) => go("grid", m)} />}
      {tab === "import" && <ImportAvailability onDone={(m) => go("plan", m)} />}
      {tab === "team" && <TeamList />}
      {tab === "rules" && <RulesEditor />}
    </div>
  );
}
