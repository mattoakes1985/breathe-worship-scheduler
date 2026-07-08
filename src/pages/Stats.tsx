// §6.11 STAT-1–4: private, personal, non-competitive serving stats.
// The Strava-reference screen — confident numbers, generous whitespace,
// framed only against the volunteer's own stated preference. Never a leaderboard.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { Award, CalendarHeart, Flame, HeartHandshake } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, PageHeader, Spinner } from "@/components/ui";
import { BarList, ChartCard, ColumnChart } from "@/components/charts";
import { formatDate, formatDateShort } from "@/lib/format";

interface Stats {
  served_this_month: number;
  served_this_quarter: number;
  served_this_year: number;
  served_total: number;
  first_served_on: string | null;
  current_streak: number;
  declined_late_count: number;
  reliability_pct: number | null;
  preferred_max_per_period: number | null;
  preferred_period_type: string | null;
}

interface ServeRow {
  service_date: string;
  role: string;
  title: string;
  service_id: string;
}

export default function Stats() {
  const { session } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  // Full personal serving history (incl. claimed spreadsheet years) for the visuals
  const { data: history } = useQuery({
    queryKey: ["my-serve-history"],
    queryFn: async () => {
      const { data } = await supabase
        .from("assignments")
        .select("status, roles(name), services!inner(id,title,service_date,status)")
        .eq("profile_id", session!.user.id)
        .in("status", ["confirmed", "substituted"]);
      return (data ?? [])
        .filter((a) => {
          const s = a.services as { status: string; service_date: string };
          return ["published", "completed"].includes(s.status) && s.service_date <= new Date().toISOString().slice(0, 10);
        })
        .map((a) => {
          const s = a.services as { id: string; title: string; service_date: string };
          return {
            service_date: s.service_date,
            title: s.title,
            service_id: s.id,
            role: (a.roles as { name: string } | null)?.name ?? "Serving",
          } as ServeRow;
        })
        .sort((a, b) => a.service_date.localeCompare(b.service_date));
    },
  });

  const monthly = useMemo(() => {
    const months: { key: string; label: string; value: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      months.push({
        key,
        label: d.toLocaleDateString("en-GB", { month: "short" }),
        value: (history ?? []).filter((h) => h.service_date.startsWith(key)).length,
      });
    }
    return months;
  }, [history]);

  const roleSplit = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of history ?? []) counts.set(h.role, (counts.get(h.role) ?? 0) + 1);
    return [...counts.entries()]
      .map(([role, n]) => ({ key: role, label: role, value: n }))
      .sort((a, b) => b.value - a.value);
  }, [history]);

  const monthServices = selectedMonth
    ? (history ?? []).filter((h) => h.service_date.startsWith(selectedMonth)).reverse()
    : [];

  const { data, isLoading } = useQuery({
    queryKey: ["my-stats"],
    queryFn: async () => {
      const [stats, messages] = await Promise.all([
        supabase.rpc("get_my_stats"),
        supabase.from("encouragement_messages").select("*").eq("is_active", true),
      ]);
      return {
        stats: stats.data as unknown as Stats,
        messages: messages.data ?? [],
      };
    },
  });

  const celebrated = useRef(false);
  const milestone = (() => {
    if (!data) return null;
    const s = data.stats;
    return (
      data.messages.find(
        (m) => m.trigger_type === "milestone_count" && m.threshold === s.served_total && s.served_total > 0
      ) ?? null
    );
  })();

  // STAT-3: brief, tasteful celebratory moment — private to this volunteer.
  useEffect(() => {
    if (milestone && !celebrated.current) {
      celebrated.current = true;
      confetti({ particleCount: 90, spread: 65, origin: { y: 0.6 }, colors: ["#2659A8", "#1FB5AA", "#5AB946"] });
    }
  }, [milestone]);

  if (isLoading || !data) return <Spinner label="Adding up your serving…" />;

  const s = data.stats;
  const cap = s.preferred_max_per_period;
  const period = s.preferred_period_type === "week" ? "week" : "month";
  const servedThisPeriod = period === "week" ? undefined : s.served_this_month;
  const atCap = cap != null && (servedThisPeriod ?? 0) >= cap;

  // STAT-4: at/over their own cap → permission to rest, never a push to serve more.
  const restMessage = data.messages.find((m) => m.trigger_type === "hit_preferred_frequency");

  return (
    <div className="space-y-6">
      <PageHeader title="Your serving story" subtitle="Just for you — this is never compared with anyone else." />

      {milestone && (
        <Card className="!bg-brand-gradient text-white border-0">
          <div className="flex items-center gap-3">
            <Award size={28} />
            <div>
              <p className="font-display font-bold text-lg">Milestone!</p>
              <p className="text-sm opacity-95">{milestone.message_template}</p>
            </div>
          </div>
        </Card>
      )}

      {atCap && restMessage && (
        <Card className="!bg-accent-soft border-accent/20">
          <div className="flex items-center gap-3">
            <HeartHandshake className="text-accent-strong shrink-0" size={22} />
            <p className="text-sm font-semibold text-accent-strong">{restMessage.message_template}</p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="This month" value={s.served_this_month} sub={cap != null ? `of ${cap} you wanted` : undefined} />
        <StatCard label="This year" value={s.served_this_year} />
        <StatCard
          label="Current streak"
          value={s.current_streak}
          sub="services without a hitch"
          icon={<Flame size={16} className="text-warning" />}
        />
        <StatCard label="All time" value={s.served_total} sub={s.first_served_on ? `since ${formatDate(s.first_served_on)}` : undefined} />
      </div>

      {(history ?? []).length > 0 && (
        <>
          <ChartCard title="Your year in serving" sub="Tap a month to see where you served.">
            <ColumnChart data={monthly} selected={selectedMonth} onSelect={(k) => setSelectedMonth(k === selectedMonth ? null : k)} />
            {selectedMonth && monthServices.length > 0 && (
              <ul className="mt-3 divide-y divide-line border-t border-line">
                {monthServices.map((h, i) => (
                  <li key={i}>
                    <Link to={`/services/${h.service_id}`} className="flex items-center justify-between py-2 text-sm hover:text-accent-strong">
                      <span className="truncate">{h.title}</span>
                      <span className="text-faint text-xs shrink-0 ml-2">
                        {h.role} · {formatDateShort(h.service_date)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {selectedMonth && monthServices.length === 0 && (
              <p className="text-faint text-sm mt-3">A quiet month — nothing served.</p>
            )}
          </ChartCard>

          {roleSplit.length > 0 && (
            <ChartCard title="What you play" sub={`Across ${history!.length} services`}>
              <BarList data={roleSplit} suffix="×" />
            </ChartCard>
          )}
        </>
      )}

      <Card>
        <div className="flex items-center gap-3 mb-2">
          <CalendarHeart size={18} className="text-accent-strong" />
          <h2 className="font-display font-bold">Reliability</h2>
        </div>
        {s.reliability_pct == null ? (
          <p className="text-soft text-sm">Once you've served a few times, you'll see your fulfilment record here.</p>
        ) : (
          <>
            <div className="h-3 rounded-full bg-raised overflow-hidden" role="img" aria-label={`Reliability ${s.reliability_pct}%`}>
              <div className="h-full bg-brand-gradient rounded-full transition-all" style={{ width: `${s.reliability_pct}%` }} />
            </div>
            <p className="text-soft text-sm mt-2">
              You've followed through on <span className="font-bold text-ink">{s.reliability_pct}%</span> of your
              confirmed services. {Number(s.reliability_pct) >= 90 ? "Your team can count on you — and it shows." : "Thanks for serving faithfully."}
            </p>
          </>
        )}
      </Card>

      <p className="text-faint text-xs text-center px-6">
        These numbers are visible only to you and your team leads (for care, not comparison). Serving
        less is never a failure — your stated rhythm is the measure here, not anyone else's.
      </p>
    </div>
  );
}

function StatCard({ label, value, sub, icon }: { label: string; value: number; sub?: string; icon?: React.ReactNode }) {
  return (
    <Card className="text-center">
      <p className="text-soft text-xs font-semibold uppercase tracking-wide flex items-center justify-center gap-1">
        {icon}
        {label}
      </p>
      <p className="font-display font-extrabold text-4xl mt-1 bg-brand-gradient bg-clip-text text-transparent">{value}</p>
      {sub && <p className="text-faint text-xs mt-0.5">{sub}</p>}
    </Card>
  );
}
