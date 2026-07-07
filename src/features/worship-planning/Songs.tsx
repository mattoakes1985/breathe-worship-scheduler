// WOR-1: song library — core fields, external links, archive not delete.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Music, Plus, Search } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Badge, Card, EmptyState, Field, Modal, PageHeader, Spinner } from "@/components/ui";
import type { Tables, TablesInsert } from "@/lib/supabase/database.types";

type Song = Tables<"songs">;

const KEYS = ["A", "Bb", "B", "C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "Am", "Bm", "Cm", "Dm", "Em", "F#m", "Gm"];

export default function Songs() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Song | "new" | null>(null);

  const { data: songs, isLoading } = useQuery({
    queryKey: ["songs"],
    queryFn: async () => {
      const { data } = await supabase.from("songs").select("*").eq("is_active", true).order("title");
      return (data ?? []) as Song[];
    },
  });

  const save = useMutation({
    mutationFn: async (song: TablesInsert<"songs"> & { id?: string }) => {
      const { id, ...rest } = song;
      const { error } = id
        ? await supabase.from("songs").update(rest).eq("id", id)
        : await supabase.from("songs").insert(rest);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["songs"] });
      setEditing(null);
    },
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("songs").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["songs"] });
      setEditing(null);
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return songs ?? [];
    return (songs ?? []).filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.artist ?? "").toLowerCase().includes(q) ||
        (s.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  }, [songs, query]);

  if (isLoading) return <Spinner label="Opening the song library…" />;

  return (
    <div className="space-y-4">
      <PageHeader
        back="/team-lead"
        title="Song library"
        subtitle={`${songs?.length ?? 0} songs`}
        action={
          <button className="btn-primary" onClick={() => setEditing("new")}>
            <Plus size={16} /> Add song
          </button>
        }
      />

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          className="input pl-9"
          placeholder="Search title, artist or tag…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search songs"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Music />}
          title={query ? "No songs match" : "The library is empty"}
          body={query ? "Try a different search." : "Add your first song — title and key are all you need to start."}
          action={
            !query ? (
              <button className="btn-primary" onClick={() => setEditing("new")}>
                <Plus size={16} /> Add your first song
              </button>
            ) : undefined
          }
        />
      ) : (
        <Card className="!p-0 divide-y divide-line">
          {filtered.map((s) => (
            <button
              key={s.id}
              className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-raised transition-colors"
              onClick={() => setEditing(s)}
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{s.title}</p>
                <p className="text-soft text-xs truncate">
                  {s.artist || "—"}
                  {s.tempo_bpm ? ` · ${s.tempo_bpm} bpm` : ""}
                  {s.time_signature ? ` · ${s.time_signature}` : ""}
                  {(s.tags ?? []).length > 0 && ` · ${(s.tags ?? []).join(", ")}`}
                </p>
              </div>
              {(s.default_key || s.male_key) && (
                <Badge tone="accent">
                  {[
                    s.default_key ? `Female ${s.default_key}` : null,
                    s.male_key ? `Male ${s.male_key}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Badge>
              )}
            </button>
          ))}
        </Card>
      )}

      <SongModal
        key={editing === "new" ? "new" : (editing as Song | null)?.id ?? "closed"}
        song={editing === "new" ? null : (editing as Song | null)}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSave={(s) => save.mutate(s)}
        onArchive={(id) => archive.mutate(id)}
        busy={save.isPending}
      />
    </div>
  );
}

function SongModal({
  song,
  open,
  onClose,
  onSave,
  onArchive,
  busy,
}: {
  song: Song | null;
  open: boolean;
  onClose: () => void;
  onSave: (s: TablesInsert<"songs"> & { id?: string }) => void;
  onArchive: (id: string) => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState(song?.title ?? "");
  const [artist, setArtist] = useState(song?.artist ?? "");
  const [key, setKey] = useState(song?.default_key ?? "");
  const [maleKey, setMaleKey] = useState(song?.male_key ?? "");
  const [timeSig, setTimeSig] = useState(song?.time_signature ?? "");
  const [bpm, setBpm] = useState(song?.tempo_bpm?.toString() ?? "");
  const [ccli, setCcli] = useState(song?.ccli_number ?? "");
  const [tags, setTags] = useState((song?.tags ?? []).join(", "));
  const [chart, setChart] = useState(song?.chord_chart_url ?? "");
  const [audio, setAudio] = useState(song?.audio_url ?? "");

  return (
    <Modal open={open} onClose={onClose} title={song ? "Edit song" : "Add a song"}>
      <div className="space-y-3">
        <Field label="Title">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Artist">
            <input className="input" value={artist} onChange={(e) => setArtist(e.target.value)} />
          </Field>
          <Field label="Female key">
            <input className="input" list="key-options" value={key} onChange={(e) => setKey(e.target.value)} />
          </Field>
          <Field label="Male key">
            <input className="input" list="key-options" value={maleKey} onChange={(e) => setMaleKey(e.target.value)} />
          </Field>
          <Field label="Tempo (bpm)">
            <input className="input" type="number" value={bpm} onChange={(e) => setBpm(e.target.value)} />
          </Field>
          <Field label="Time signature">
            <input className="input" value={timeSig} onChange={(e) => setTimeSig(e.target.value)} placeholder="4/4" />
          </Field>
          <Field label="CCLI number">
            <input className="input" value={ccli} onChange={(e) => setCcli(e.target.value)} />
          </Field>
          <datalist id="key-options">
            {KEYS.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </div>
        <Field label="Tags" hint="Comma-separated, e.g. fast, opener, communion">
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
        <Field label="Chord chart link">
          <input className="input" type="url" value={chart} onChange={(e) => setChart(e.target.value)} />
        </Field>
        <Field label="Audio/YouTube link">
          <input className="input" type="url" value={audio} onChange={(e) => setAudio(e.target.value)} />
        </Field>
        <button
          className="btn-primary w-full"
          disabled={busy || title.trim().length === 0}
          onClick={() =>
            onSave({
              id: song?.id,
              title: title.trim(),
              artist: artist || null,
              default_key: key || null,
              male_key: maleKey || null,
              time_signature: timeSig || null,
              tempo_bpm: bpm ? Number(bpm) : null,
              ccli_number: ccli || null,
              tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : null,
              chord_chart_url: chart || null,
              audio_url: audio || null,
            })
          }
        >
          {busy ? "Saving…" : "Save song"}
        </button>
        {song && (
          <button className="btn-ghost w-full text-danger" onClick={() => onArchive(song.id)}>
            Archive song (stays on past services)
          </button>
        )}
      </div>
    </Modal>
  );
}
