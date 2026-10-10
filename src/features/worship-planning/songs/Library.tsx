// Song library: search, filter, sort, saved views (two-tap finds), list or
// table view, print, and bulk quick-tagging. Filters live in the URL so
// back/forward and refresh keep your place.
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, LayoutList, Music, Plus, Printer, Search, SlidersHorizontal, Star, Table2, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Badge, Card, EmptyState, ErrorState, Field, Modal, Spinner } from "@/components/ui";
import { formatDateShort } from "@/lib/format";
import FilterPanel from "./FilterPanel";
import SongEditor from "./SongEditor";
import { invalidateSongs, songErrorMessage, SONG_KEYS, useSavedViews, useSongLibrary, useSongTags, type SavedView } from "./data";
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

const PRESETS: { name: string; filters: SongFilters; sort?: SortSpec }[] = [
  { name: "Due a comeback", filters: { notSungMonths: 3, minTimesSung: 3 }, sort: { key: "last_sung", dir: "asc" } },
  { name: "In rotation", filters: { rotation: "in" }, sort: { key: "times_sung", dir: "desc" } },
  { name: "Needs checking", filters: { needsChecking: true } },
  { name: "Missing BPM", filters: { missing: ["bpm"] } },
  { name: "Christmas", filters: { tags: ["Christmas"] } },
];

function readJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function Library() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const filters = readJson<SongFilters>(params.get("f"), {});
  const sort = readJson<SortSpec>(params.get("s"), { key: "title", dir: "asc" });
  const layout = params.get("view") === "table" ? "table" : "list";

  const update = (next: { f?: SongFilters; s?: SortSpec; view?: string }) => {
    const p = new URLSearchParams(params);
    if (next.f !== undefined) Object.keys(next.f).length ? p.set("f", JSON.stringify(next.f)) : p.delete("f");
    if (next.s !== undefined) next.s.key === "title" && next.s.dir === "asc" ? p.delete("s") : p.set("s", JSON.stringify(next.s));
    if (next.view !== undefined) next.view === "list" ? p.delete("view") : p.set("view", next.view);
    setParams(p, { replace: true });
  };

  const { data: songs, isLoading, error, refetch } = useSongLibrary();
  const { data: tags } = useSongTags();
  const { data: views } = useSavedViews();

  const [editing, setEditing] = useState<SongWithStats | "new" | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const results = useMemo(() => sortSongs((songs ?? []).filter((s) => matchesFilters(s, filters)), sort), [songs, params]); // eslint-disable-line react-hooks/exhaustive-deps
  const tagNames = useMemo(() => {
    const live = (tags ?? []).filter((t) => !t.archived_at).map((t) => t.name);
    const used = new Set((songs ?? []).flatMap((s) => s.tags ?? []));
    return [...live, ...[...used].filter((u) => !live.some((l) => l.toLowerCase() === u.toLowerCase())).sort()];
  }, [tags, songs]);
  const topArtists = useMemo(() => {
    // group "Hillsong UNITED"/"Hillsong Worship" under their first word when it repeats
    const counts = new Map<string, number>();
    for (const s of songs ?? []) {
      if (!s.artist || !s.is_active) continue;
      const first = s.artist.split(/[\s&]/)[0];
      counts.set(first, (counts.get(first) ?? 0) + 1);
    }
    return [...counts.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([a]) => a);
  }, [songs]);

  const bulk = useMutation({
    mutationFn: async (args: { add?: string; remove?: string }) => {
      const { error } = await supabase.rpc("bulk_tag_songs", {
        p_song_ids: [...selected],
        p_add: args.add ? [args.add] : [],
        p_remove: args.remove ? [args.remove] : [],
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateSongs(qc),
  });

  if (isLoading) return <Spinner label="Opening the song library…" />;
  if (error) return <ErrorState message={songErrorMessage(error)} retry={() => refetch()} />;

  const nFilters = activeFilterCount(filters);
  const editingSong = editing && editing !== "new" ? (songs ?? []).find((s) => s.id === editing.id) ?? editing : null;

  return (
    <div className="space-y-3">
      {/* print-only header */}
      <div className="hidden print:block mb-2">
        <h1 className="text-xl font-bold">Breathe Worship — songs</h1>
        <p className="text-sm">{describeFilters(filters)} · {results.length} songs · printed {new Date().toLocaleDateString("en-GB")}</p>
      </div>

      <div className="print:hidden space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              className="input pl-9"
              placeholder="Search title, artist, tag or CCLI…"
              value={filters.q ?? ""}
              onChange={(e) => update({ f: { ...filters, q: e.target.value || undefined } })}
              aria-label="Search songs"
            />
          </div>
          <button
            className={`btn-secondary shrink-0 ${nFilters ? "!border-accent text-accent-strong" : ""}`}
            aria-label={nFilters ? `Filters (${nFilters} on)` : "Filters"}
            onClick={() => setShowFilters(true)}
          >
            <SlidersHorizontal size={16} /> <span className="hidden sm:inline">Filters</span>
            {nFilters > 0 && <span className="chip bg-accent text-white dark:text-brand-ink !px-2 !py-0">{nFilters}</span>}
          </button>
        </div>

        {/* Two-tap finds: saved views + presets */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" aria-label="Saved views">
          {(views ?? []).map((v) => (
            <ViewChip key={v.id} label={v.name} star onClick={() => update({ f: v.filters, s: v.sort ?? { key: "title", dir: "asc" } })} />
          ))}
          {PRESETS.map((p) => (
            <ViewChip key={p.name} label={p.name} onClick={() => update({ f: p.filters, s: p.sort ?? { key: "title", dir: "asc" } })} />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 justify-between">
          <p className="text-sm text-soft">
            <strong className="text-ink">{results.length}</strong> {results.length === 1 ? "song" : "songs"} · {describeFilters(filters)}
            {(nFilters > 0 || filters.q) && (
              <button className="ml-2 text-accent-strong font-semibold underline-offset-2 hover:underline min-h-0" onClick={() => update({ f: {} })}>
                Clear
              </button>
            )}
          </p>
          <div className="flex items-center gap-1.5">
            <select
              className="input !min-h-[40px] !w-auto text-sm py-0"
              aria-label="Sort by"
              value={`${sort.key}:${sort.dir}`}
              onChange={(e) => {
                const [key, dir] = e.target.value.split(":") as [SortKey, "asc" | "desc"];
                update({ s: { key, dir } });
              }}
            >
              {(Object.keys(SORT_LABEL) as SortKey[]).flatMap((k) => [
                <option key={`${k}:asc`} value={`${k}:asc`}>
                  {SORT_LABEL[k]} {k === "title" || k === "artist" ? "A–Z" : k === "last_sung" ? "(longest ago)" : k === "updated" ? "(oldest)" : "↑"}
                </option>,
                <option key={`${k}:desc`} value={`${k}:desc`}>
                  {SORT_LABEL[k]} {k === "title" || k === "artist" ? "Z–A" : k === "last_sung" ? "(most recent)" : k === "updated" ? "(newest)" : "↓"}
                </option>,
              ])}
            </select>
            <button
              className="btn-ghost !min-h-[40px] px-2"
              aria-label={layout === "list" ? "Show as table" : "Show as list"}
              title={layout === "list" ? "Table view" : "List view"}
              onClick={() => update({ view: layout === "list" ? "table" : "list" })}
            >
              {layout === "list" ? <Table2 size={18} /> : <LayoutList size={18} />}
            </button>
            <button className="btn-ghost !min-h-[40px] px-2" aria-label="Print this list" title="Print" onClick={() => window.print()}>
              <Printer size={18} />
            </button>
            <button
              className={`btn-ghost !min-h-[40px] px-2 ${selecting ? "text-accent-strong" : ""}`}
              aria-pressed={selecting}
              title="Select songs to tag"
              onClick={() => {
                setSelecting((s) => !s);
                setSelected(new Set());
              }}
            >
              <CheckSquare size={18} />
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button className="btn-primary" onClick={() => setEditing("new")}>
            <Plus size={16} /> Add song
          </button>
          <button className="btn-secondary" onClick={() => setSaving(true)} disabled={!profile}>
            <Star size={16} /> Save this view
          </button>
        </div>

        {selecting && (
          <BulkBar
            count={selected.size}
            tagNames={tagNames}
            busy={bulk.isPending}
            error={bulk.error ? songErrorMessage(bulk.error) : null}
            onSelectAll={() => setSelected(new Set(results.map((s) => s.id)))}
            onClear={() => setSelected(new Set())}
            onApply={(add, remove) => bulk.mutate({ add, remove })}
          />
        )}
      </div>

      {results.length === 0 ? (
        <EmptyState
          icon={<Music />}
          title="No songs match"
          body="Try removing a filter, or clear them all."
          action={
            <button className="btn-secondary" onClick={() => update({ f: {} })}>
              Clear filters
            </button>
          }
        />
      ) : layout === "table" ? (
        <SongTable songs={results} selecting={selecting} selected={selected} onToggle={(id) => setSelected(toggle(selected, id))} onOpen={(s) => setEditing(s)} />
      ) : (
        <Card className="!p-0 divide-y divide-line">
          {results.map((s) => (
            <SongRow
              key={s.id}
              s={s}
              selecting={selecting}
              checked={selected.has(s.id)}
              onToggle={() => setSelected(toggle(selected, s.id))}
              onOpen={() => setEditing(s)}
            />
          ))}
        </Card>
      )}

      {editing !== null && <SongEditor song={editing === "new" ? null : editingSong} open onClose={() => setEditing(null)} />}
      {saving && <SaveViewModal filters={filters} sort={sort} views={views ?? []} ownerId={profile?.id ?? ""} onClose={() => setSaving(false)} />}
      <Modal open={showFilters} onClose={() => setShowFilters(false)} title="Filter songs">
        <FilterPanel filters={filters} onChange={(f) => update({ f })} tagNames={tagNames} topArtists={topArtists} />
        <div className="sticky bottom-0 pt-4 flex gap-2">
          <button className="btn-secondary flex-1" onClick={() => update({ f: filters.q ? { q: filters.q } : {} })}>
            Clear all
          </button>
          <button className="btn-primary flex-1" onClick={() => setShowFilters(false)}>
            Show {results.length} songs
          </button>
        </div>
      </Modal>
    </div>
  );
}

function toggle(set: Set<string>, id: string) {
  const next = new Set(set);
  next.has(id) ? next.delete(id) : next.add(id);
  return next;
}

function ViewChip({ label, onClick, star }: { label: string; onClick: () => void; star?: boolean }) {
  return (
    <button className="chip min-h-[36px] bg-raised text-soft hover:text-ink whitespace-nowrap shrink-0" onClick={onClick}>
      {star && <Star size={12} className="text-accent" />} {label}
    </button>
  );
}

function keysLabel(s: SongWithStats) {
  return [s.default_key ? `Female ${s.default_key}` : null, s.male_key ? `Male ${s.male_key}` : null].filter(Boolean).join(" · ");
}

function SongRow({ s, selecting, checked, onToggle, onOpen }: { s: SongWithStats; selecting: boolean; checked: boolean; onToggle: () => void; onOpen: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-raised/60 transition-colors">
      {selecting && <input type="checkbox" className="w-5 h-5 shrink-0" checked={checked} onChange={onToggle} aria-label={`Select ${s.title}`} />}
      <button className="flex-1 min-w-0 text-left min-h-0" onClick={selecting ? onToggle : onOpen}>
        <p className="font-semibold text-sm truncate">
          {s.title}
          {!s.is_active && <span className="ml-2 text-xs text-faint font-normal">archived</span>}
        </p>
        <p className="text-soft text-xs truncate">
          {[s.artist, tempoLine(s), s.stats.times_sung ? `sung ${s.stats.times_sung}×, last ${formatDateShort(s.stats.last_sung)}` : "not sung yet"]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {(s.tags ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {(s.tags ?? []).map((t) => (
              <span key={t} className="text-[11px] rounded-full bg-raised px-2 py-0.5 text-soft">
                {t}
              </span>
            ))}
          </div>
        )}
      </button>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {keysLabel(s) && <Badge tone="accent">{keysLabel(s)}</Badge>}
        {s.openReviews > 0 && <Badge tone="warning">Check {s.openReviews}</Badge>}
      </div>
    </div>
  );
}

function SongTable({
  songs,
  selecting,
  selected,
  onToggle,
  onOpen,
}: {
  songs: SongWithStats[];
  selecting: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (s: SongWithStats) => void;
}) {
  return (
    <div className="card !p-0 overflow-x-auto print:overflow-visible">
      <table className="w-full text-sm min-w-[760px] print:min-w-0 print:text-[11px]">
        <thead>
          <tr className="text-left text-xs text-faint border-b border-line">
            {selecting && <th className="px-3 py-2 print:hidden" />}
            <th className="px-3 py-2 font-semibold sticky left-0 bg-surface/80 backdrop-blur print:static print:bg-transparent">Title</th>
            <th className="px-3 py-2 font-semibold">Artist</th>
            <th className="px-3 py-2 font-semibold">Female</th>
            <th className="px-3 py-2 font-semibold">Male</th>
            <th className="px-3 py-2 font-semibold">BPM</th>
            <th className="px-3 py-2 font-semibold">Time</th>
            <th className="px-3 py-2 font-semibold">Click</th>
            <th className="px-3 py-2 font-semibold">Tags</th>
            <th className="px-3 py-2 font-semibold">Last sung</th>
            <th className="px-3 py-2 font-semibold text-right">Sung</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {songs.map((s) => (
            <tr key={s.id} className="hover:bg-raised/60 cursor-pointer print:break-inside-avoid" onClick={() => (selecting ? onToggle(s.id) : onOpen(s))}>
              {selecting && (
                <td className="px-3 py-2 print:hidden" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" className="w-5 h-5" checked={selected.has(s.id)} onChange={() => onToggle(s.id)} aria-label={`Select ${s.title}`} />
                </td>
              )}
              <td className="px-3 py-2 font-semibold sticky left-0 bg-surface/80 backdrop-blur print:static print:bg-transparent">
                {s.title}
                {s.openReviews > 0 && <span className="ml-1 text-warning print:hidden" title="Needs checking">•</span>}
              </td>
              <td className="px-3 py-2 text-soft">{s.artist ?? "—"}</td>
              <td className="px-3 py-2">{s.default_key ?? "—"}</td>
              <td className="px-3 py-2">{s.male_key ?? "—"}</td>
              <td className="px-3 py-2 tabular-nums">
                {s.tempo_bpm ?? "—"}
                {s.is_swung && <span className="text-faint"> sw</span>}
              </td>
              <td className="px-3 py-2">{s.time_signature ?? "—"}</td>
              <td className="px-3 py-2">{s.click_signature ?? ""}</td>
              <td className="px-3 py-2 text-soft">{(s.tags ?? []).join(", ")}</td>
              <td className="px-3 py-2 text-soft whitespace-nowrap">{s.stats.last_sung ? formatDateShort(s.stats.last_sung) : "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{s.stats.times_sung || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BulkBar({
  count,
  tagNames,
  busy,
  error,
  onSelectAll,
  onClear,
  onApply,
}: {
  count: number;
  tagNames: string[];
  busy: boolean;
  error: string | null;
  onSelectAll: () => void;
  onClear: () => void;
  onApply: (add?: string, remove?: string) => void;
}) {
  const [tag, setTag] = useState("");
  return (
    <Card className="!py-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <strong>{count} selected</strong>
        <button className="btn-ghost !min-h-[36px] px-2" onClick={onSelectAll}>
          Select all shown
        </button>
        {count > 0 && (
          <button className="btn-ghost !min-h-[36px] px-2" onClick={onClear}>
            <X size={14} /> Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input className="input !min-h-[40px] flex-1 min-w-[10rem]" list="bulk-tag-options" placeholder="Tag name" value={tag} onChange={(e) => setTag(e.target.value.replace(/,/g, ""))} />
        <datalist id="bulk-tag-options">{tagNames.map((t) => <option key={t} value={t} />)}</datalist>
        <button className="btn-primary !min-h-[40px]" disabled={busy || !count || !tag.trim()} onClick={() => onApply(tag.trim(), undefined)}>
          Add tag
        </button>
        <button className="btn-secondary !min-h-[40px]" disabled={busy || !count || !tag.trim()} onClick={() => onApply(undefined, tag.trim())}>
          Remove tag
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </Card>
  );
}

function SaveViewModal({ filters, sort, views, ownerId, onClose }: { filters: SongFilters; sort: SortSpec; views: SavedView[]; ownerId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("song_saved_views").insert({ name: name.trim(), is_shared: shared, filters: JSON.parse(JSON.stringify({ filters, sort })) });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SONG_KEYS.views });
      onClose();
    },
    onError: (e) => setError(songErrorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("song_saved_views").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SONG_KEYS.views }),
  });
  const mine = views.filter((v) => v.owner_id === ownerId);
  return (
    <Modal open onClose={onClose} title="Save this view">
      <div className="space-y-3">
        <p className="text-sm text-soft">{describeFilters(filters)}, sorted by {SORT_LABEL[sort.key].toLowerCase()}.</p>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Slow songs in G" autoFocus />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="w-5 h-5" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          Share with the other leads
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button className="btn-primary w-full" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
          Save view
        </button>
        {mine.length > 0 && (
          <div className="pt-3 border-t border-line">
            <h3 className="text-xs font-bold uppercase tracking-wide text-faint mb-1.5">Your saved views</h3>
            <ul className="space-y-1">
              {mine.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">
                    {v.name}
                    {v.is_shared && <span className="text-faint"> · shared</span>}
                  </span>
                  <button className="btn-ghost !min-h-[36px] px-2 text-danger" onClick={() => remove.mutate(v.id)} aria-label={`Remove ${v.name}`}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
