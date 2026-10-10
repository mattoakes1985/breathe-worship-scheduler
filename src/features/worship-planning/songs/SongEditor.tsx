// Song editor: every field, optimistic concurrency (save is refused if
// someone else saved first), archive/unarchive, and the History/Restore panel.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Badge, Field, Modal } from "@/components/ui";
import { formatDateShort, formatDateTime } from "@/lib/format";
import type { Json } from "@/lib/supabase/database.types";
import { invalidateSongs, songErrorMessage, SONG_KEYS, useSongTags } from "./data";
import { FIELD_LABEL, formatValue, type SongWithStats } from "./songModel";

const KEY_OPTIONS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B", "Cm", "Dm", "Em", "F#m", "Gm", "Am", "Bm"];
const METERS = ["4/4", "6/8", "3/4", "12/8", "2/4"];
const CLICKS = ["3/8", "4/8", "6/8", "4/4"];

interface Props {
  song: SongWithStats | null; // null = new song
  open: boolean;
  onClose: () => void;
}

export default function SongEditor({ song, open, onClose }: Props) {
  const [tab, setTab] = useState<"details" | "history">("details");
  return (
    <Modal open={open} onClose={onClose} title={song ? song.title : "Add a song"}>
      {song && (
        <div className="flex gap-1 mb-4 -mt-1" role="tablist">
          {(["details", "history"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={`chip min-h-[36px] ${tab === t ? "bg-accent-soft text-accent-strong" : "bg-raised text-soft"}`}
              onClick={() => setTab(t)}
            >
              {t === "details" ? "Details" : <><History size={14} /> History (v{song.version})</>}
            </button>
          ))}
        </div>
      )}
      {tab === "details" || !song ? (
        <SongForm key={song ? `${song.id}-${song.version}` : "new"} song={song} onDone={onClose} />
      ) : (
        <SongHistory song={song} onRestored={() => setTab("details")} />
      )}
    </Modal>
  );
}

function SongForm({ song, onDone }: { song: SongWithStats | null; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: catalogue } = useSongTags();
  const [v, setV] = useState({
    title: song?.title ?? "",
    artist: song?.artist ?? "",
    default_key: song?.default_key ?? "",
    male_key: song?.male_key ?? "",
    tempo_bpm: song?.tempo_bpm?.toString() ?? "",
    bpm_feel: song?.bpm_feel ?? "",
    time_signature: song?.time_signature ?? "",
    click_signature: song?.click_signature ?? "",
    is_swung: song?.is_swung ?? false,
    tags: song?.tags ?? [],
    ccli_number: song?.ccli_number ?? "",
    chord_chart_url: song?.chord_chart_url ?? "",
    audio_url: song?.audio_url ?? "",
    notes: song?.notes ?? "",
  });
  const [newTag, setNewTag] = useState("");
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));

  const payload = () => ({
    title: v.title.trim(),
    artist: v.artist.trim() || null,
    default_key: v.default_key.trim() || null,
    male_key: v.male_key.trim() || null,
    tempo_bpm: v.tempo_bpm ? Math.round(Number(v.tempo_bpm)) : null,
    bpm_feel: v.bpm_feel || null,
    time_signature: v.time_signature.trim() || null,
    click_signature: v.click_signature.trim() || null,
    is_swung: v.is_swung,
    tags: v.tags.length ? v.tags : null,
    ccli_number: v.ccli_number.trim() || null,
    chord_chart_url: v.chord_chart_url.trim() || null,
    audio_url: v.audio_url.trim() || null,
    notes: v.notes.trim() || null,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!song) {
        const { error } = await supabase.from("songs").insert(payload());
        if (error) throw error;
        return;
      }
      // Optimistic concurrency: only update the version we loaded.
      const { data, error } = await supabase
        .from("songs")
        .update(payload())
        .eq("id", song.id)
        .eq("version", song.version)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0)
        throw new Error("Someone else saved this song after you opened it. Close and reopen it to see their changes — nothing of yours was saved.");
    },
    onSuccess: () => {
      invalidateSongs(qc);
      onDone();
    },
    onError: (e) => setError(songErrorMessage(e)),
  });

  const archive = useMutation({
    mutationFn: async (active: boolean) => {
      if (!song) return;
      const { data, error } = await supabase.from("songs").update({ is_active: active }).eq("id", song.id).eq("version", song.version).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("This song changed since you opened it — reopen and try again.");
    },
    onSuccess: () => {
      invalidateSongs(qc);
      onDone();
    },
    onError: (e) => setError(songErrorMessage(e)),
  });

  const toggleTag = (t: string) =>
    set("tags", v.tags.some((x) => x.toLowerCase() === t.toLowerCase()) ? v.tags.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...v.tags, t]);
  const liveTags = (catalogue ?? []).filter((t) => !t.archived_at);
  const extraTags = v.tags.filter((t) => !liveTags.some((c) => c.name.toLowerCase() === t.toLowerCase()));

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        save.mutate();
      }}
    >
      {song?.merged_into_id && <p className="text-sm text-warning">This song was merged into another and is kept only for history.</p>}
      <Field label="Title">
        <input className="input" value={v.title} onChange={(e) => set("title", e.target.value)} required maxLength={200} />
      </Field>
      <Field label="Artist">
        <input className="input" value={v.artist} onChange={(e) => set("artist", e.target.value)} maxLength={200} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Female key">
          <input className="input" list="song-key-options" value={v.default_key} onChange={(e) => set("default_key", e.target.value)} maxLength={40} />
        </Field>
        <Field label="Male key">
          <input className="input" list="song-key-options" value={v.male_key} onChange={(e) => set("male_key", e.target.value)} maxLength={40} />
        </Field>
        <Field label="BPM" hint="As ChartBuilder shows it">
          <input className="input" type="number" inputMode="numeric" min={20} max={300} value={v.tempo_bpm} onChange={(e) => set("tempo_bpm", e.target.value)} />
        </Field>
        <Field label="Feel">
          <select className="input" value={v.bpm_feel} onChange={(e) => set("bpm_feel", e.target.value)}>
            <option value="">Normal</option>
            <option value="half-time">Half-time</option>
            <option value="double-time">Double-time</option>
          </select>
        </Field>
        <Field label="Time signature" hint="The song's real meter">
          <input className="input" list="song-meter-options" value={v.time_signature} onChange={(e) => set("time_signature", e.target.value)} placeholder="4/4" />
        </Field>
        <Field label="Click" hint="What you set on the click">
          <input className="input" list="song-click-options" value={v.click_signature} onChange={(e) => set("click_signature", e.target.value)} placeholder="e.g. 3/8" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" className="w-5 h-5 accent-[rgb(var(--c-accent))]" checked={v.is_swung} onChange={(e) => set("is_swung", e.target.checked)} />
        Swung feel
      </label>
      <datalist id="song-key-options">{KEY_OPTIONS.map((k) => <option key={k} value={k} />)}</datalist>
      <datalist id="song-meter-options">{METERS.map((k) => <option key={k} value={k} />)}</datalist>
      <datalist id="song-click-options">{CLICKS.map((k) => <option key={k} value={k} />)}</datalist>

      <div>
        <span className="block text-sm font-semibold mb-1.5">Tags</span>
        <div className="flex flex-wrap gap-1.5">
          {[...liveTags.map((t) => t.name), ...extraTags].map((t) => {
            const on = v.tags.some((x) => x.toLowerCase() === t.toLowerCase());
            return (
              <button
                type="button"
                key={t}
                aria-pressed={on}
                className={`chip min-h-[36px] ${on ? "bg-accent text-white dark:text-brand-ink" : "bg-raised text-soft"}`}
                onClick={() => toggleTag(t)}
              >
                {t}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 mt-2">
          <input className="input" placeholder="New tag…" value={newTag} maxLength={40} onChange={(e) => setNewTag(e.target.value.replace(/,/g, ""))} />
          <button
            type="button"
            className="btn-secondary shrink-0"
            disabled={!newTag.trim()}
            onClick={() => {
              if (!v.tags.some((x) => x.toLowerCase() === newTag.trim().toLowerCase())) set("tags", [...v.tags, newTag.trim()]);
              setNewTag("");
            }}
          >
            Add
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="CCLI number">
          <input className="input" value={v.ccli_number} onChange={(e) => set("ccli_number", e.target.value)} />
        </Field>
        <div />
      </div>
      <Field label="Chord chart link">
        <input className="input" type="url" value={v.chord_chart_url} onChange={(e) => set("chord_chart_url", e.target.value)} placeholder="https://" />
      </Field>
      <Field label="Audio / YouTube link">
        <input className="input" type="url" value={v.audio_url} onChange={(e) => set("audio_url", e.target.value)} placeholder="https://" />
      </Field>
      <Field label="Notes">
        <textarea className="input py-2 min-h-[80px]" value={v.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>

      {song && (
        <p className="text-xs text-faint">
          Sung {song.stats.times_sung}× · last {song.stats.last_sung ? formatDateShort(song.stats.last_sung) : "never"}
          {song.legacy_played_keys.length > 0 && ` · played in ${song.legacy_played_keys.join(", ")}`} · version {song.version}
        </p>
      )}
      {error && (
        <p className="text-sm text-danger bg-danger-soft rounded-md px-3 py-2" role="alert">
          {error}
        </p>
      )}
      <button className="btn-primary w-full" disabled={save.isPending || !v.title.trim()}>
        {save.isPending ? "Saving…" : song ? "Save changes" : "Add song"}
      </button>
      {song && !song.merged_into_id && (
        <button type="button" className="btn-ghost w-full" disabled={archive.isPending} onClick={() => archive.mutate(!song.is_active)}>
          {song.is_active ? "Archive song (stays on past services)" : "Bring back from archive"}
        </button>
      )}
    </form>
  );
}

const HISTORY_LABEL: Record<string, string> = { ...FIELD_LABEL, legacy_played_keys: "Keys played in", merged_into_id: "Merged into" };

const OP_LABEL: Record<string, string> = {
  baseline: "Starting point",
  insert: "Added",
  update: "Edited",
  restore: "Restored",
  merge: "Merged",
  review: "Needs-checking decision",
  import: "Data import",
  tag: "Tags changed",
};

function SongHistory({ song, onRestored }: { song: SongWithStats; onRestored: () => void }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: SONG_KEYS.history(song.id),
    queryFn: async () => {
      const [h, people] = await Promise.all([
        supabase.from("songs_history").select("*").eq("song_id", song.id).order("version", { ascending: false }),
        supabase.from("profiles").select("id, full_name, preferred_name"),
      ]);
      if (h.error) throw h.error;
      const names = new Map((people.data ?? []).map((p) => [p.id, p.preferred_name || p.full_name]));
      return (h.data ?? []).map((r) => ({ ...r, who: r.changed_by ? names.get(r.changed_by) ?? "Someone" : "System" }));
    },
  });

  const restore = useMutation({
    mutationFn: async (version: number) => {
      const { error } = await supabase.rpc("restore_song_version", { p_song_id: song.id, p_version: version });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateSongs(qc);
      setConfirm(null);
      onRestored();
    },
    onError: (e) => setError(songErrorMessage(e)),
  });

  if (isLoading) return <p className="text-soft text-sm py-6 text-center">Loading history…</p>;
  const rows = data ?? [];
  return (
    <div className="space-y-2">
      <p className="text-xs text-faint">Every change is kept. Restoring creates a new version — nothing is lost.</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <ol className="space-y-2">
        {rows.map((r) => {
          const snap = r.snapshot as { [k: string]: Json };
          const fields = r.changed_fields.filter((f) => f in HISTORY_LABEL);
          return (
            <li key={r.id} className="rounded-md border border-line px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    v{r.version} · {OP_LABEL[r.op] ?? r.op}
                    {r.version === song.version && <span className="ml-2"><Badge tone="accent">Current</Badge></span>}
                  </p>
                  <p className="text-xs text-faint">
                    {formatDateTime(r.changed_at)} · {r.who}
                  </p>
                </div>
                {r.version !== song.version &&
                  (confirm === r.version ? (
                    <div className="flex gap-1 shrink-0">
                      <button className="btn-primary !min-h-[36px] px-3" disabled={restore.isPending} onClick={() => restore.mutate(r.version)}>
                        Restore
                      </button>
                      <button className="btn-ghost !min-h-[36px] px-2" onClick={() => setConfirm(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button className="btn-secondary !min-h-[36px] px-3 shrink-0" onClick={() => setConfirm(r.version)}>
                      <RotateCcw size={14} /> Restore
                    </button>
                  ))}
              </div>
              {fields.length > 0 && (
                <ul className="mt-1.5 text-xs text-soft space-y-0.5">
                  {fields.map((f) => (
                    <li key={f}>
                      <span className="text-faint">{HISTORY_LABEL[f]}:</span> {formatValue(snap[f])}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
