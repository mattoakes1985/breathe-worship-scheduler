// Duplicate finder + merge. Merging repoints every setlist/running-order
// reference to the kept song and archives the other (nothing is removed).
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyCheck } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Badge, Card, EmptyState, ErrorState, Spinner } from "@/components/ui";
import { formatDateShort } from "@/lib/format";
import { invalidateSongs, songErrorMessage, SONG_KEYS, useSongLibrary } from "./data";
import { findDuplicates, pairKey, tempoLine, type DuplicatePair, type SongWithStats } from "./songModel";

export default function Duplicates() {
  const { data: songs, isLoading, error, refetch } = useSongLibrary();
  const { data: dismissed } = useQuery({
    queryKey: SONG_KEYS.dismissals,
    queryFn: async () => {
      const { data, error } = await supabase.from("song_duplicate_dismissals").select("song_a, song_b");
      if (error) throw error;
      return new Set((data ?? []).map((d) => pairKey(d.song_a, d.song_b)));
    },
  });
  const pairs = useMemo(() => (songs && dismissed ? findDuplicates(songs, dismissed) : []), [songs, dismissed]);
  const byId = useMemo(() => new Map((songs ?? []).map((s) => [s.id, s])), [songs]);

  if (isLoading || !dismissed) return <Spinner label="Looking for duplicates…" />;
  if (error) return <ErrorState message={songErrorMessage(error)} retry={() => refetch()} />;
  if (pairs.length === 0)
    return <EmptyState icon={<CopyCheck />} title="No likely duplicates" body="Songs with the same or near-identical titles show up here so you can merge them." />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-soft">
        {pairs.length} possible {pairs.length === 1 ? "pair" : "pairs"}. Merging keeps one song, moves every setlist entry onto it, fills its blank fields from the other, and archives the other. You can still see the archived one, and its history is kept.
      </p>
      {pairs.map((p) => (
        <PairCard key={pairKey(p.a.id, p.b.id)} pair={p} a={byId.get(p.a.id)!} b={byId.get(p.b.id)!} />
      ))}
    </div>
  );
}

function SongSide({ s }: { s: SongWithStats }) {
  return (
    <div className="min-w-0 rounded-md border border-line p-3 space-y-0.5">
      <p className="font-semibold text-sm">{s.title}</p>
      <p className="text-xs text-soft">{s.artist ?? "No artist"}</p>
      <p className="text-xs text-soft">{tempoLine(s) || "No BPM"}</p>
      <p className="text-xs text-soft">Keys: {[s.default_key && `Female ${s.default_key}`, s.male_key && `Male ${s.male_key}`].filter(Boolean).join(" · ") || "—"}</p>
      <p className="text-xs text-soft">
        Sung {s.stats.times_sung}× {s.stats.last_sung ? `· last ${formatDateShort(s.stats.last_sung)}` : ""}
      </p>
      {!s.is_active && <Badge>Archived</Badge>}
    </div>
  );
}

function PairCard({ pair, a, b }: { pair: DuplicatePair; a: SongWithStats; b: SongWithStats }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<"a" | "b" | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const merge = useMutation({
    mutationFn: async (keep: "a" | "b") => {
      const [k, m] = keep === "a" ? [a, b] : [b, a];
      const { data, error } = await supabase.rpc("merge_songs", { p_keep: k.id, p_merge: m.id });
      if (error) throw error;
      const r = data as { setlist_rows_moved: number; services_listing_song_twice: string[] };
      return `Merged into “${k.title}”: ${r.setlist_rows_moved} setlist ${r.setlist_rows_moved === 1 ? "entry" : "entries"} moved.` +
        (r.services_listing_song_twice?.length
          ? ` ${r.services_listing_song_twice.length} service(s) now list this song twice — open those services to remove the extra line.`
          : "");
    },
    onSuccess: (msg) => {
      setResult(msg);
      invalidateSongs(qc);
    },
    onError: (e) => setError(songErrorMessage(e)),
  });

  const dismiss = useMutation({
    mutationFn: async () => {
      const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
      const { error } = await supabase.from("song_duplicate_dismissals").insert({ song_a: x, song_b: y });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SONG_KEYS.dismissals }),
    onError: (e) => setError(songErrorMessage(e)),
  });

  if (result) return <Card className="!py-3 text-sm text-positive">{result}</Card>;

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge tone={pair.strength === "same title" ? "warning" : "info"}>{pair.strength}</Badge>
        <span className="text-xs text-soft">{pair.reason}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <SongSide s={a} />
        <SongSide s={b} />
      </div>
      {confirm ? (
        <div className="rounded-md bg-warning-soft px-3 py-2 text-sm space-y-2">
          <p>
            Keep <strong>{confirm === "a" ? a.title : b.title}</strong> and merge <strong>{confirm === "a" ? b.title : a.title}</strong> into it?
          </p>
          <div className="flex gap-2">
            <button className="btn-primary !min-h-[40px]" disabled={merge.isPending} onClick={() => merge.mutate(confirm)}>
              {merge.isPending ? "Merging…" : "Yes, merge"}
            </button>
            <button className="btn-ghost !min-h-[40px]" onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary !min-h-[40px]" onClick={() => setConfirm("a")}>
            Keep first
          </button>
          <button className="btn-secondary !min-h-[40px]" onClick={() => setConfirm("b")}>
            Keep second
          </button>
          <button className="btn-ghost !min-h-[40px]" disabled={dismiss.isPending} onClick={() => dismiss.mutate()}>
            Not duplicates
          </button>
        </div>
      )}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </Card>
  );
}
