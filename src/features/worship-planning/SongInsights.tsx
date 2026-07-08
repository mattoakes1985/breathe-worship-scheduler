// Song Insights — lead-facing visuals over five years of setlist history.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { PageHeader, Spinner } from "@/components/ui";
import { BarList, ChartCard, ColumnChart } from "@/components/charts";
import { formatDate } from "@/lib/format";

interface Play {
  songId: string;
  title: string;
  date: string;
  key: string | null;
}

export default function SongInsights() {
  const [selectedSong, setSelectedSong] = useState<string | null>(null);
  const [range, setRange] = useState<"all" | "12m">("12m");

  const { data: plays, isLoading } = useQuery({
    queryKey: ["song-insights"],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_songs")
        .select("song_id, key_override, songs(title,default_key), services!inner(service_date)")
        .lte("services.service_date", new Date().toISOString().slice(0, 10));
      return (data ?? []).map((r) => ({
        songId: r.song_id,
        title: (r.songs as { title: string } | null)?.title ?? "?",
        date: (r.services as { service_date: string }).service_date,
        key: r.key_override || (r.songs as { default_key: string | null } | null)?.default_key || null,
      })) as Play[];
    },
  });

  const cutoff = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const inRange = useMemo(
    () => (plays ?? []).filter((p) => range === "all" || p.date >= cutoff),
    [plays, range, cutoff]
  );

  const topSongs = useMemo(() => {
    const counts = new Map<string, { title: string; n: number; last: string }>();
    for (const p of inRange) {
      const cur = counts.get(p.songId);
      if (!cur) counts.set(p.songId, { title: p.title, n: 1, last: p.date });
      else {
        cur.n += 1;
        if (p.date > cur.last) cur.last = p.date;
      }
    }
    return [...counts.entries()]
      .map(([id, c]) => ({ key: id, label: c.title, value: c.n, sublabel: `last ${formatDate(c.last)}` }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15);
  }, [inRange]);

  const keySpread = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of inRange) {
      const k = p.key?.trim().match(/^[A-G][#b]?m?/)?.[0];
      if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([k, n]) => ({ key: k, label: k, value: n }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [inRange]);

  const comebacks = useMemo(() => {
    const cutoff120 = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
    const counts = new Map<string, { title: string; n: number; last: string }>();
    for (const p of plays ?? []) {
      const cur = counts.get(p.songId);
      if (!cur) counts.set(p.songId, { title: p.title, n: 1, last: p.date });
      else {
        cur.n += 1;
        if (p.date > cur.last) cur.last = p.date;
      }
    }
    return [...counts.values()]
      .filter((c) => c.n >= 5 && c.last < cutoff120)
      .sort((a, b) => b.n - a.n)
      .slice(0, 10);
  }, [plays]);

  // Drill-down for a selected song: plays per year + recent dates
  const drill = useMemo(() => {
    if (!selectedSong || !plays) return null;
    const mine = plays.filter((p) => p.songId === selectedSong).sort((a, b) => a.date.localeCompare(b.date));
    if (mine.length === 0) return null;
    const perYear = new Map<string, number>();
    for (const p of mine) perYear.set(p.date.slice(0, 4), (perYear.get(p.date.slice(0, 4)) ?? 0) + 1);
    const years: { key: string; label: string; value: number }[] = [];
    for (let y = 2021; y <= new Date().getFullYear(); y++) {
      years.push({ key: String(y), label: String(y), value: perYear.get(String(y)) ?? 0 });
    }
    return { title: mine[0].title, years, recent: mine.slice(-6).reverse() };
  }, [selectedSong, plays]);

  if (isLoading) return <Spinner label="Analysing five years of setlists…" />;

  return (
    <div className="space-y-4">
      <PageHeader
        back="/team-lead/songs"
        title="Song insights"
        subtitle={`${(plays ?? []).length} plays on record since 2021.`}
        action={
          <div className="flex gap-1">
            <button className={`chip min-h-[40px] ${range === "12m" ? "bg-accent text-white" : "bg-raised text-soft"}`} onClick={() => setRange("12m")}>
              12 months
            </button>
            <button className={`chip min-h-[40px] ${range === "all" ? "bg-accent text-white" : "bg-raised text-soft"}`} onClick={() => setRange("all")}>
              All time
            </button>
          </div>
        }
      />

      <ChartCard title="Most sung" sub="Tap a song to see its story.">
        <BarList
          data={topSongs}
          suffix="×"
          selected={selectedSong}
          onSelect={(k) => setSelectedSong(k === selectedSong ? null : k)}
        />
      </ChartCard>

      {drill && (
        <ChartCard title={drill.title} sub="Plays per year">
          <ColumnChart data={drill.years} height={100} />
          <div className="mt-3 border-t border-line pt-2">
            <p className="text-faint text-xs mb-1">Recent outings</p>
            <ul className="text-sm space-y-1">
              {drill.recent.map((p, i) => (
                <li key={i} className="flex justify-between">
                  <span className="text-soft">{formatDate(p.date)}</span>
                  <span className="text-faint text-xs">{p.key ? `Key ${p.key}` : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        </ChartCard>
      )}

      {comebacks.length > 0 && (
        <ChartCard title="💤 Due a comeback" sub="Team favourites (5+ plays) not sung in 120+ days.">
          <ul className="divide-y divide-line">
            {comebacks.map((c, i) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="font-semibold truncate">{c.title}</span>
                <span className="text-faint text-xs shrink-0 ml-2">
                  {c.n}× · last {formatDate(c.last)}
                </span>
              </li>
            ))}
          </ul>
        </ChartCard>
      )}

      {keySpread.length > 0 && (
        <ChartCard title="Keys you sing in" sub={range === "12m" ? "Last 12 months" : "All time"}>
          <BarList data={keySpread} suffix="×" />
        </ChartCard>
      )}
    </div>
  );
}
