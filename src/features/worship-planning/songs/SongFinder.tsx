// Song finder for planning one service: the master library's search, filters,
// sort and saved views, plus planning helpers — "close to the key of song 2",
// what's already on a nearby Sunday, and a shortlist ("considering") so a
// leader can gather options before choosing the set.
import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Music, Plus, Search, SlidersHorizontal, Star } from "lucide-react";
import { Badge, EmptyState } from "@/components/ui";
import { formatDateShort } from "@/lib/format";
import FilterPanel from "./FilterPanel";
import {
  activeFilterCount,
  describeFilters,
  matchesFilters,
  SORT_LABEL,
  sortSongs,
  tempoLine,
  type SongFilters,
  type SongWithStats,
  type SortKey,
  type SortSpec,
} from "./songModel";
import type { SavedView } from "./data";

export type NearbyUse = { date: string; title: string };

const QUICK: { name: string; filters: SongFilters; sort?: SortSpec }[] = [
  { name: "Due a comeback", filters: { notSungMonths: 3, minTimesSung: 3 }, sort: { key: "last_sung", dir: "asc" } },
  { name: "In rotation", filters: { rotation: "in" }, sort: { key: "times_sung", dir: "desc" } },
  { name: "Never sung", filters: { rotation: "never" } },
];

const PAGE = 60;

export function keysLabel(s: Pick<SongWithStats, "default_key" | "male_key">) {
  return [s.default_key ? `Female ${s.default_key}` : null, s.male_key ? `Male ${s.male_key}` : null].filter(Boolean).join(" · ");
}

export default function SongFinder({
  library,
  inSet,
  considering,
  nearby,
  setKeys,
  tagNames,
  topArtists,
  views,
  busy,
  onAdd,
  onConsider,
}: {
  library: SongWithStats[];
  inSet: Set<string>;
  considering: Set<string>;
  nearby: Map<string, NearbyUse[]>;
  /** keys already in the set, for "close to the key of …" chips */
  setKeys: { label: string; key: string }[];
  tagNames: string[];
  topArtists: string[];
  views: SavedView[];
  busy: boolean;
  onAdd: (songId: string) => void;
  onConsider: (songId: string, on: boolean) => void;
}) {
  const [filters, setFilters] = useState<SongFilters>({});
  const [sort, setSort] = useState<SortSpec>({ key: "title", dir: "asc" });
  const [showFilters, setShowFilters] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const results = useMemo(() => sortSongs(library.filter((s) => matchesFilters(s, filters)), sort), [library, filters, sort]);
  const nFilters = activeFilterCount(filters);
  const apply = (f: SongFilters, s?: SortSpec) => {
    setFilters(f);
    if (s) setSort(s);
    setLimit(PAGE);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            className="input pl-9"
            placeholder="Search title, artist or tag…"
            value={filters.q ?? ""}
            onChange={(e) => apply({ ...filters, q: e.target.value || undefined })}
            aria-label="Search songs"
            autoFocus
          />
        </div>
        <button
          className={`btn-secondary shrink-0 ${nFilters ? "!border-accent text-accent-strong" : ""}`}
          aria-expanded={showFilters}
          aria-label={nFilters ? `Filters (${nFilters} on)` : "Filters"}
          onClick={() => setShowFilters((v) => !v)}
        >
          <SlidersHorizontal size={16} /> <span className="hidden sm:inline">Filters</span>
          {nFilters > 0 && <span className="chip bg-accent text-white dark:text-brand-ink !px-2 !py-0">{nFilters}</span>}
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" aria-label="Quick finds">
        {setKeys.map((k) => (
          <button
            key={k.label}
            className="chip min-h-[36px] bg-accent-soft text-accent-strong whitespace-nowrap shrink-0"
            onClick={() => apply({ keys: [k.key], closeKeys: true }, { key: "times_sung", dir: "desc" })}
            title={`Songs in ${k.key}, or a 4th/5th up, or the relative key`}
          >
            Works with {k.label} ({k.key})
          </button>
        ))}
        {views.map((v) => (
          <button key={v.id} className="chip min-h-[36px] bg-raised text-soft hover:text-ink whitespace-nowrap shrink-0" onClick={() => apply(v.filters, v.sort)}>
            <Star size={12} className="text-accent" /> {v.name}
          </button>
        ))}
        {QUICK.map((p) => (
          <button key={p.name} className="chip min-h-[36px] bg-raised text-soft hover:text-ink whitespace-nowrap shrink-0" onClick={() => apply(p.filters, p.sort)}>
            {p.name}
          </button>
        ))}
      </div>

      {showFilters && (
        <div className="rounded-lg border border-line p-3 bg-surface/50">
          <FilterPanel filters={filters} onChange={(f) => apply(f)} tagNames={tagNames} topArtists={topArtists} />
          <button className="btn-secondary w-full mt-3" onClick={() => setShowFilters(false)}>
            Show {results.length} songs
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-soft min-w-0">
          <strong className="text-ink">{results.length}</strong> · {describeFilters(filters)}
          {(nFilters > 0 || filters.q) && (
            <button className="ml-2 text-accent-strong font-semibold hover:underline min-h-0" onClick={() => apply({})}>
              Clear
            </button>
          )}
        </p>
        <select
          className="input !min-h-[40px] !w-auto text-sm py-0"
          aria-label="Sort by"
          value={`${sort.key}:${sort.dir}`}
          onChange={(e) => {
            const [key, dir] = e.target.value.split(":") as [SortKey, "asc" | "desc"];
            setSort({ key, dir });
          }}
        >
          <option value="title:asc">Title A–Z</option>
          <option value="times_sung:desc">Most sung</option>
          <option value="last_sung:asc">Longest since sung</option>
          <option value="last_sung:desc">Sung most recently</option>
          <option value="bpm:asc">{SORT_LABEL.bpm} (slowest)</option>
          <option value="bpm:desc">{SORT_LABEL.bpm} (fastest)</option>
          <option value="female_key:asc">{SORT_LABEL.female_key}</option>
          <option value="male_key:asc">{SORT_LABEL.male_key}</option>
          <option value="artist:asc">Artist A–Z</option>
        </select>
      </div>

      {results.length === 0 ? (
        <EmptyState icon={<Music />} title="No songs match" body="Try removing a filter." action={<button className="btn-secondary" onClick={() => apply({})}>Clear filters</button>} />
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface/40">
          {results.slice(0, limit).map((s) => {
            const near = nearby.get(s.id) ?? [];
            const isOpen = open === s.id;
            const set = inSet.has(s.id);
            const cons = considering.has(s.id);
            return (
              <li key={s.id} className="px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <button className="flex-1 min-w-0 text-left min-h-0" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.id)}>
                    <p className="font-semibold text-sm flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{s.title}</span>
                      {set && <Badge tone="positive">in the set</Badge>}
                      <ChevronDown size={14} className={`shrink-0 text-faint transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </p>
                    <p className="text-soft text-xs truncate">
                      {[s.artist, tempoLine(s), s.stats.times_sung ? `sung ${s.stats.times_sung}×, last ${formatDateShort(s.stats.last_sung)}` : "never sung"].filter(Boolean).join(" · ")}
                    </p>
                    {near.length > 0 && (
                      <p className="text-warning text-xs mt-0.5">Also on {near.map((n) => formatDateShort(n.date)).join(", ")}</p>
                    )}
                  </button>
                  {keysLabel(s) && <span className="chip !py-0.5 bg-accent-soft text-accent-strong text-xs shrink-0 hidden sm:inline-flex">{keysLabel(s)}</span>}
                  <button
                    className={`btn-ghost !min-h-[40px] px-2 shrink-0 ${cons ? "text-accent" : "text-faint"}`}
                    aria-pressed={cons}
                    aria-label={cons ? `Stop considering ${s.title}` : `Consider ${s.title}`}
                    title={cons ? "Considering — tap to remove" : "Add to the songs you're considering"}
                    disabled={busy || set}
                    onClick={() => onConsider(s.id, !cons)}
                  >
                    <Star size={18} fill={cons ? "currentColor" : "none"} />
                  </button>
                  <button className="btn-secondary !min-h-[40px] px-2.5 shrink-0" aria-label={`Add ${s.title} to the set`} disabled={busy || set} onClick={() => onAdd(s.id)}>
                    <Plus size={16} /> <span className="hidden sm:inline">Set</span>
                  </button>
                </div>
                {isOpen && <SongDetails s={s} />}
              </li>
            );
          })}
        </ul>
      )}
      {results.length > limit && (
        <button className="btn-ghost w-full" onClick={() => setLimit((n) => n + PAGE)}>
          Show more ({results.length - limit} left)
        </button>
      )}
    </div>
  );
}

/** The useful bits of a song for choosing it, read-only. */
export function SongDetails({ s }: { s: SongWithStats }) {
  const played = [...new Set([...(s.legacy_played_keys ?? []), ...s.stats.played_keys])];
  return (
    <div className="mt-2 ml-0.5 space-y-1.5 text-xs">
      <p className="sm:hidden"><span className="text-faint">Keys:</span> {keysLabel(s) || "—"}</p>
      {played.length > 0 && <p><span className="text-faint">We've played it in:</span> {played.join(", ")}</p>}
      {s.stats.next_planned && <p><span className="text-faint">Next planned:</span> {formatDateShort(s.stats.next_planned)}</p>}
      {(s.tags ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(s.tags ?? []).map((t) => <span key={t} className="rounded-full bg-raised px-2 py-0.5 text-soft">{t}</span>)}
        </div>
      )}
      {s.notes && <p className="text-soft whitespace-pre-line">{s.notes}</p>}
      {(s.chord_chart_url || s.audio_url) && (
        <div className="flex flex-wrap gap-3">
          {s.chord_chart_url && <a className="inline-flex items-center gap-1 font-semibold text-accent-strong min-h-[36px]" href={s.chord_chart_url} target="_blank" rel="noreferrer">Chart <ExternalLink size={12} /></a>}
          {s.audio_url && <a className="inline-flex items-center gap-1 font-semibold text-accent-strong min-h-[36px]" href={s.audio_url} target="_blank" rel="noreferrer">Listen <ExternalLink size={12} /></a>}
        </div>
      )}
    </div>
  );
}
