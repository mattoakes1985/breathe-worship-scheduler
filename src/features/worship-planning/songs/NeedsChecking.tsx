// "Needs checking": data the app isn't sure about, queued for a human.
// Every decision goes through resolve_song_review (or a normal song update),
// so it lands in the song's history and can be undone with Restore.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Badge, Card, EmptyState, ErrorState, Spinner } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { invalidateSongs, songErrorMessage, SONG_KEYS } from "./data";
import { tempoLine } from "./songModel";

const KIND: Record<string, { title: string; blurb: string }> = {
  bpm_conflict: { title: "BPM disagrees with your setlists", blurb: "Use the setlist BPM, keep the app's, or type the right one (as ChartBuilder shows it)." },
  bpm_half_double: { title: "Setlists show a doubled BPM", blurb: "Usually an old doubled count — keep the BPM and set the click (3/8 or 4/8) on the song instead." },
  added_from_history: { title: "Added from your setlist history", blurb: "Sung before but missing from the library — keep it (then add its keys) or archive it." },
  artist_suggestion: { title: "Artist suggestions", blurb: "Unverified — accept, correct, or turn down." },
  time_signature: { title: "Time signature", blurb: "" },
  bpm_filled_from_history: { title: "Filled in from history", blurb: "" },
};
const ORDER = ["bpm_conflict", "bpm_half_double", "added_from_history", "artist_suggestion", "time_signature"];

interface Item {
  id: string;
  kind: string;
  field: string | null;
  current_value: string | null;
  suggested_value: string | null;
  evidence: string | null;
  source: string;
  status: string;
  resolution_note: string | null;
  resolved_at: string | null;
  song_id: string;
  songs: { id: string; title: string; artist: string | null; tempo_bpm: number | null; time_signature: string | null; click_signature: string | null; is_swung: boolean; bpm_feel: string | null; version: number; is_active: boolean } | null;
}

export default function NeedsChecking() {
  const [showDone, setShowDone] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [...SONG_KEYS.reviews, showDone],
    queryFn: async (): Promise<Item[]> => {
      let q = supabase
        .from("song_review_items")
        .select("*, songs!song_review_items_song_id_fkey(id,title,artist,tempo_bpm,time_signature,click_signature,is_swung,bpm_feel,version,is_active)")
        .order("created_at");
      q = showDone ? q.neq("status", "open").order("resolved_at", { ascending: false }).limit(100) : q.eq("status", "open");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Item[];
    },
  });

  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of data ?? []) m.set(it.kind, [...(m.get(it.kind) ?? []), it]);
    return [...m.entries()].sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]));
  }, [data]);

  if (isLoading) return <Spinner label="Loading the checking list…" />;
  if (error) return <ErrorState message={songErrorMessage(error)} retry={() => refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-soft">
          {showDone ? "Recent decisions" : `${data?.length ?? 0} things to check`} — nothing here changes a song until you decide.
        </p>
        <button className="btn-ghost !min-h-[36px] px-2 text-sm" onClick={() => setShowDone((s) => !s)}>
          {showDone ? "Show open items" : "Show decisions made"}
        </button>
      </div>
      {groups.length === 0 && (
        <EmptyState icon={<CheckCircle2 />} title={showDone ? "No decisions yet" : "All checked"} body={showDone ? undefined : "Nothing is waiting for you. New questions appear here when the app isn't sure about something."} />
      )}
      {groups.map(([kind, items]) => (
        <section key={kind} className="space-y-2">
          <div>
            <h2 className="font-display font-bold">
              {KIND[kind]?.title ?? kind} <span className="text-faint font-normal">({items.length})</span>
            </h2>
            {!showDone && KIND[kind]?.blurb && <p className="text-xs text-soft">{KIND[kind].blurb}</p>}
          </div>
          {items.map((it) => (showDone ? <DoneRow key={it.id} it={it} /> : <ItemCard key={it.id} it={it} />))}
        </section>
      ))}
    </div>
  );
}

function DoneRow({ it }: { it: Item }) {
  return (
    <Card className="!py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{it.songs?.title}</p>
          <p className="text-xs text-soft">{it.resolution_note ?? (it.status === "accepted" ? `Accepted ${it.suggested_value ?? ""}` : "Turned down")}</p>
        </div>
        <div className="text-right shrink-0">
          <Badge tone={it.status === "accepted" ? "positive" : it.status === "rejected" ? "neutral" : "info"}>
            {it.status === "info" ? "Noted" : it.status === "accepted" ? "Accepted" : "Kept as was"}
          </Badge>
          <p className="text-[11px] text-faint mt-1">{formatDateTime(it.resolved_at)}</p>
        </div>
      </div>
    </Card>
  );
}

function ItemCard({ it }: { it: Item }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(it.suggested_value ?? "");
  const [error, setError] = useState<string | null>(null);

  const resolve = useMutation({
    mutationFn: async (args: { accept: boolean; value?: string | null; note?: string }) => {
      const { error } = await supabase.rpc("resolve_song_review", {
        p_item_id: it.id,
        p_accept: args.accept,
        p_value: args.value ?? undefined,
        p_note: args.note,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateSongs(qc),
    onError: (e) => setError(songErrorMessage(e)),
  });

  const archiveSong = useMutation({
    mutationFn: async () => {
      const s = it.songs!;
      const { data, error } = await supabase.from("songs").update({ is_active: false }).eq("id", s.id).eq("version", s.version).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("The song changed since this list loaded — refresh and try again.");
      const r = await supabase.rpc("resolve_song_review", { p_item_id: it.id, p_accept: false, p_note: "Archived from Needs checking" });
      if (r.error) throw r.error;
    },
    onSuccess: () => invalidateSongs(qc),
    onError: (e) => setError(songErrorMessage(e)),
  });

  const busy = resolve.isPending || archiveSong.isPending;
  const s = it.songs;

  return (
    <Card className="!py-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold truncate">{s?.title ?? "Unknown song"}</p>
          <p className="text-xs text-soft truncate">{[s?.artist, s ? tempoLine(s) : null].filter(Boolean).join(" · ")}</p>
        </div>
        {it.source.startsWith("Claude") && <Badge tone="warning">Unverified</Badge>}
      </div>
      {it.evidence && <p className="text-sm text-soft">{it.evidence}</p>}

      {it.kind === "bpm_conflict" && (
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary !min-h-[40px]" disabled={busy} onClick={() => resolve.mutate({ accept: true })}>
            Use {it.suggested_value}
          </button>
          <button className="btn-secondary !min-h-[40px]" disabled={busy} onClick={() => resolve.mutate({ accept: false, note: `Kept ${it.current_value} bpm` })}>
            Keep {it.current_value}
          </button>
          <span className="flex items-center gap-1">
            <input className="input !min-h-[40px] w-20" type="number" inputMode="numeric" aria-label="Correct BPM" value={value} onChange={(e) => setValue(e.target.value)} />
            <button className="btn-secondary !min-h-[40px]" disabled={busy || !value} onClick={() => resolve.mutate({ accept: true, value })}>
              Set
            </button>
          </span>
        </div>
      )}

      {it.kind === "bpm_half_double" && (
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary !min-h-[40px]" disabled={busy} onClick={() => resolve.mutate({ accept: false, note: `Kept ${s?.tempo_bpm} bpm (old setlist used a doubled count)` })}>
            Keep {s?.tempo_bpm} bpm
          </button>
          <button className="btn-secondary !min-h-[40px]" disabled={busy} onClick={() => resolve.mutate({ accept: true })}>
            Mark as {it.suggested_value} feel
          </button>
        </div>
      )}

      {it.kind === "added_from_history" && (
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary !min-h-[40px]" disabled={busy} onClick={() => resolve.mutate({ accept: true, note: "Kept in the library" })}>
            Keep in library
          </button>
          <button className="btn-secondary !min-h-[40px]" disabled={busy} onClick={() => archiveSong.mutate()}>
            Archive it
          </button>
        </div>
      )}

      {it.kind === "artist_suggestion" && (
        <div className="flex flex-wrap items-center gap-2">
          <input className="input !min-h-[40px] flex-1 min-w-[12rem]" aria-label="Artist" placeholder="Type the artist" value={value} onChange={(e) => setValue(e.target.value)} />
          <button className="btn-primary !min-h-[40px]" disabled={busy || !value.trim()} onClick={() => resolve.mutate({ accept: true, value: value.trim() })}>
            {value.trim() && value.trim() === it.suggested_value ? "Accept" : "Save artist"}
          </button>
          <button className="btn-ghost !min-h-[40px]" disabled={busy} onClick={() => resolve.mutate({ accept: false, note: "Suggestion turned down" })}>
            Not right
          </button>
        </div>
      )}

      {(it.kind === "time_signature" || it.kind === "bpm_filled_from_history") && (
        <div className="flex gap-2">
          <button className="btn-primary !min-h-[40px]" disabled={busy} onClick={() => resolve.mutate({ accept: true })}>
            Accept {it.suggested_value}
          </button>
          <button className="btn-secondary !min-h-[40px]" disabled={busy} onClick={() => resolve.mutate({ accept: false })}>
            Keep as is
          </button>
        </div>
      )}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </Card>
  );
}
