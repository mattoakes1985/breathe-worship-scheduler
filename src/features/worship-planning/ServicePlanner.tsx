import { toLocalISODate } from "@/lib/format";
// Worship planning on the service page, for team leads, admins and whoever is
// leading that Sunday: find songs with the master library's search and
// filters, keep a shortlist ("considering"), choose the set and keys (with the
// key move between songs shown), and build the running order.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ListMusic, Plus, Search, Star, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Card, Field, Modal } from "@/components/ui";
import { formatDateShort } from "@/lib/format";
import { SONG_KEYS, useSavedViews, useSongLibrary, useSongTags } from "./songs/data";
import { keyMove, parseKeys, tempoLine } from "./songs/songModel";
import SongFinder, { keysLabel, type NearbyUse } from "./songs/SongFinder";

const ITEM_TYPES = ["song", "sermon", "announcement", "communion", "offering", "custom"] as const;

type SetSong = {
  title: string; artist: string | null; default_key: string | null; male_key: string | null;
  tempo_bpm: number | null; time_signature: string | null; click_signature: string | null; is_swung: boolean; bpm_feel: string | null;
  chord_chart_url: string | null; audio_url: string | null;
};

const NEARBY_DAYS = 28;
const shiftDays = (iso: string, n: number) => toLocalISODate(new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n));

export default function ServicePlanner({ serviceId, serviceDate }: { serviceId: string; serviceDate?: string }) {
  const qc = useQueryClient();
  const [finderOpen, setFinderOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { data: library } = useSongLibrary();
  const { data: tags } = useSongTags();
  const { data: views } = useSavedViews();

  const { data } = useQuery({
    queryKey: ["service-planner", serviceId, serviceDate],
    queryFn: async () => {
      const from = serviceDate ? shiftDays(serviceDate, -NEARBY_DAYS) : null;
      const to = serviceDate ? shiftDays(serviceDate, NEARBY_DAYS) : null;
      const [songs, order, shortlist, near] = await Promise.all([
        supabase
          .from("service_songs")
          .select("*, songs(title,artist,default_key,male_key,tempo_bpm,time_signature,click_signature,is_swung,bpm_feel,chord_chart_url,audio_url)")
          .eq("service_id", serviceId)
          .order("order_index"),
        supabase.from("service_order_items").select("*").eq("service_id", serviceId).order("order_index"),
        supabase.from("service_song_shortlist").select("id, song_id, note, created_at").eq("service_id", serviceId).order("created_at"),
        // songs on other services within four weeks either side
        from && to
          ? supabase
              .from("service_songs")
              .select("song_id, services!inner(id, title, service_date, status, archived_at)")
              .neq("service_id", serviceId)
              .gte("services.service_date", from)
              .lte("services.service_date", to)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (songs.error) throw songs.error;
      if (order.error) throw order.error;
      const nearby = new Map<string, NearbyUse[]>();
      for (const u of (near.data ?? []) as { song_id: string; services: { title: string; service_date: string; status: string; archived_at: string | null } }[]) {
        if (u.services.archived_at || u.services.status === "cancelled") continue;
        const list = nearby.get(u.song_id) ?? [];
        if (!list.some((x) => x.date === u.services.service_date)) list.push({ date: u.services.service_date, title: u.services.title });
        nearby.set(u.song_id, list.sort((a, b) => a.date.localeCompare(b.date)));
      }
      return { setList: songs.data ?? [], order: order.data ?? [], shortlist: shortlist.data ?? [], nearby };
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["service-planner", serviceId] });
    qc.invalidateQueries({ queryKey: ["service-detail", serviceId] });
    qc.invalidateQueries({ queryKey: SONG_KEYS.library });
  };
  const onError = (e: Error) => setErr(e.message);
  const ok = () => { setErr(null); invalidate(); };

  const addSong = useMutation({
    mutationFn: async (songId: string) => {
      const { error } = await supabase.from("service_songs").insert({ service_id: serviceId, song_id: songId, order_index: (data?.setList.length ?? 0) + 1 });
      if (error) throw error;
      // chosen: it's no longer just being considered
      const short = data?.shortlist.find((x) => x.song_id === songId);
      if (short) await supabase.from("service_song_shortlist").delete().eq("id", short.id);
    },
    onSuccess: ok,
    onError,
  });

  const consider = useMutation({
    mutationFn: async (args: { songId: string; on: boolean }) => {
      if (args.on) {
        const { error } = await supabase.from("service_song_shortlist").insert({ service_id: serviceId, song_id: args.songId });
        if (error && !error.message.includes("duplicate")) throw error;
      } else {
        const { error } = await supabase.from("service_song_shortlist").delete().eq("service_id", serviceId).eq("song_id", args.songId);
        if (error) throw error;
      }
    },
    onSuccess: ok,
    onError,
  });

  const setNote = useMutation({
    mutationFn: async (args: { id: string; note: string }) => {
      const { error } = await supabase.from("service_song_shortlist").update({ note: args.note.slice(0, 200) || null }).eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: ok,
    onError,
  });

  const removeSong = useMutation({
    mutationFn: async (args: { id: string; songId: string; keep: boolean }) => {
      const { error } = await supabase.from("service_songs").delete().eq("id", args.id);
      if (error) throw error;
      if (args.keep) await supabase.from("service_song_shortlist").insert({ service_id: serviceId, song_id: args.songId });
    },
    onSuccess: ok,
    onError,
  });

  const setKeyOverride = useMutation({
    mutationFn: async (args: { id: string; key: string }) => {
      const { error } = await supabase.from("service_songs").update({ key_override: args.key || null }).eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: ok,
    onError,
  });

  const moveSong = useMutation({
    mutationFn: async (args: { index: number; dir: -1 | 1 }) => {
      const list = data!.setList;
      const other = args.index + args.dir;
      if (other < 0 || other >= list.length) return;
      await Promise.all([
        supabase.from("service_songs").update({ order_index: other + 1 }).eq("id", list[args.index].id),
        supabase.from("service_songs").update({ order_index: args.index + 1 }).eq("id", list[other].id),
      ]);
    },
    onSuccess: ok,
    onError,
  });

  const addItem = useMutation({
    mutationFn: async (args: { type: string; title: string; minutes: number | null }) => {
      const { error } = await supabase.from("service_order_items").insert({
        service_id: serviceId,
        item_type: args.type,
        title: args.title,
        duration_minutes: args.minutes,
        order_index: (data?.order.length ?? 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      ok();
      setAddItemOpen(false);
    },
    onError,
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_order_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: ok,
    onError,
  });

  const moveItem = useMutation({
    mutationFn: async (args: { index: number; dir: -1 | 1 }) => {
      const list = data!.order;
      const other = args.index + args.dir;
      if (other < 0 || other >= list.length) return;
      await Promise.all([
        supabase.from("service_order_items").update({ order_index: other + 1 }).eq("id", list[args.index].id),
        supabase.from("service_order_items").update({ order_index: args.index + 1 }).eq("id", list[other].id),
      ]);
    },
    onSuccess: ok,
    onError,
  });

  const byId = useMemo(() => new Map((library ?? []).map((s) => [s.id, s])), [library]);
  const tagNames = useMemo(() => {
    const live = (tags ?? []).filter((t) => !t.archived_at).map((t) => t.name);
    const used = new Set((library ?? []).flatMap((s) => s.tags ?? []));
    return [...live, ...[...used].filter((u) => !live.some((l) => l.toLowerCase() === u.toLowerCase())).sort()];
  }, [tags, library]);
  const topArtists = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of library ?? []) {
      if (!s.artist || !s.is_active) continue;
      const first = s.artist.split(/[\s&]/)[0];
      counts.set(first, (counts.get(first) ?? 0) + 1);
    }
    return [...counts.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([a]) => a);
  }, [library]);

  if (!data) return null;

  const busy = addSong.isPending || consider.isPending || removeSong.isPending;
  const playedKey = (ss: (typeof data.setList)[number]) => ss.key_override || (ss.songs as SetSong | null)?.default_key || null;
  const inSet = new Set(data.setList.map((s) => s.song_id));
  const considering = new Set(data.shortlist.map((s) => s.song_id));
  const setKeys: { label: string; key: string }[] = [];
  data.setList.forEach((ss, i) => {
    const k = parseKeys(playedKey(ss))[0];
    if (k && !setKeys.some((x) => x.key === k)) setKeys.push({ label: `song ${i + 1}`, key: k });
  });

  return (
    <section aria-label="Plan worship" className="space-y-3">
      <h2 className="flex items-center gap-2 font-display font-bold text-sm uppercase tracking-wide text-faint">
        <ListMusic size={14} /> Plan worship
      </h2>
      {err && <p className="text-sm text-danger" role="alert">{err}</p>}

      <Card>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="font-display font-bold text-sm">Song set</h3>
          <button className="btn-primary !min-h-[38px]" onClick={() => setFinderOpen(true)}>
            <Search size={14} /> Find songs
          </button>
        </div>
        {data.setList.length === 0 ? (
          <p className="text-faint text-sm">No songs yet. Find songs in the library, star the ones you're considering, then add your picks.</p>
        ) : (
          <ul>
            {data.setList.map((ss, i) => {
              const song = ss.songs as SetSong | null;
              const move = i > 0 ? keyMove(playedKey(data.setList[i - 1]), playedKey(ss)) : null;
              return (
                <li key={ss.id}>
                  {move && (
                    <p className={`ml-6 py-0.5 text-[11px] ${/semitone|tritone/.test(move) ? "text-warning" : "text-faint"}`}>
                      ↓ {move}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 border-t border-line first:border-t-0">
                    <span className="text-faint font-display font-bold w-4 text-center text-sm">{i + 1}</span>
                    <div className="flex-1 min-w-[11rem]">
                      <p className="font-semibold text-sm truncate">{song?.title}</p>
                      <p className="text-faint text-xs truncate">
                        {[song?.artist, song ? tempoLine(song) : null].filter(Boolean).join(" · ")}
                        {song?.chord_chart_url && (
                          <>
                            {" · "}
                            <a className="text-accent-strong font-semibold" href={song.chord_chart_url} target="_blank" rel="noreferrer">chart</a>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 ml-auto">
                    <KeyPicker
                      femaleKey={song?.default_key ?? null}
                      maleKey={song?.male_key ?? null}
                      current={ss.key_override}
                      onPick={(key) => setKeyOverride.mutate({ id: ss.id, key })}
                    />
                    <button className="btn-ghost !min-h-[36px] px-1.5" aria-label="Move up" onClick={() => moveSong.mutate({ index: i, dir: -1 })}>
                      <ArrowUp size={14} />
                    </button>
                    <button className="btn-ghost !min-h-[36px] px-1.5" aria-label="Move down" onClick={() => moveSong.mutate({ index: i, dir: 1 })}>
                      <ArrowDown size={14} />
                    </button>
                    <button
                      className="btn-ghost !min-h-[36px] px-1.5 text-danger"
                      aria-label={`Take ${song?.title ?? "song"} out (back to considering)`}
                      title="Take out — it goes back to the songs you're considering"
                      disabled={busy}
                      onClick={() => removeSong.mutate({ id: ss.id, songId: ss.song_id, keep: true })}
                    >
                      <X size={14} />
                    </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-between mt-5 mb-1">
          <h3 className="font-display font-bold text-sm flex items-center gap-1.5">
            <Star size={14} className="text-accent" /> Considering {data.shortlist.length > 0 && <span className="text-faint font-normal">({data.shortlist.length})</span>}
          </h3>
          {data.shortlist.length > 0 && (
            <button className="btn-ghost !min-h-[36px] text-sm" onClick={() => setFinderOpen(true)}>
              <Plus size={14} /> More
            </button>
          )}
        </div>
        {data.shortlist.length === 0 ? (
          <p className="text-faint text-sm">Star songs in <button className="text-accent-strong font-semibold hover:underline min-h-0" onClick={() => setFinderOpen(true)}>Find songs</button> to gather options here. Only you and the team leads see this list.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.shortlist.map((c) => {
              const s = byId.get(c.song_id);
              const near = data.nearby.get(c.song_id) ?? [];
              return (
                <li key={c.id} className="py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{s?.title ?? "Song"}</p>
                      <p className="text-faint text-xs truncate">
                        {s ? [keysLabel(s), tempoLine(s), s.stats.last_sung ? `last ${formatDateShort(s.stats.last_sung)}` : "never sung"].filter(Boolean).join(" · ") : ""}
                      </p>
                      {near.length > 0 && <p className="text-warning text-xs">Also on {near.map((n) => formatDateShort(n.date)).join(", ")}</p>}
                    </div>
                    <button className="btn-secondary !min-h-[36px] px-2.5 shrink-0" disabled={busy} onClick={() => addSong.mutate(c.song_id)} aria-label={`Add ${s?.title ?? "song"} to the set`}>
                      <Plus size={14} /> Set
                    </button>
                    <button className="btn-ghost !min-h-[36px] px-1.5 text-faint hover:text-danger shrink-0" disabled={busy} aria-label={`Stop considering ${s?.title ?? "song"}`} onClick={() => consider.mutate({ songId: c.song_id, on: false })}>
                      <X size={14} />
                    </button>
                  </div>
                  <input
                    className="input !min-h-[32px] !py-1 text-xs mt-1"
                    placeholder="Note (e.g. opener? capo 2)"
                    defaultValue={c.note ?? ""}
                    maxLength={200}
                    aria-label={`Note for ${s?.title ?? "song"}`}
                    onBlur={(e) => e.target.value !== (c.note ?? "") && setNote.mutate({ id: c.id, note: e.target.value.trim() })}
                  />
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-between mt-5 mb-2">
          <h3 className="font-display font-bold text-sm">Running order</h3>
          <button className="btn-secondary !min-h-[38px]" onClick={() => setAddItemOpen(true)}>
            <Plus size={14} /> Add item
          </button>
        </div>
        {data.order.length === 0 ? (
          <p className="text-faint text-sm">No running order yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.order.map((item, i) => (
              <li key={item.id} className="flex items-center gap-2 py-2">
                <span className="chip bg-raised text-soft">{item.item_type}</span>
                <span className="flex-1 min-w-0 font-semibold text-sm truncate">{item.title}</span>
                {item.duration_minutes != null && <span className="text-faint text-xs">{item.duration_minutes}m</span>}
                <button className="btn-ghost !min-h-[36px] px-1.5" aria-label="Move up" onClick={() => moveItem.mutate({ index: i, dir: -1 })}>
                  <ArrowUp size={14} />
                </button>
                <button className="btn-ghost !min-h-[36px] px-1.5" aria-label="Move down" onClick={() => moveItem.mutate({ index: i, dir: 1 })}>
                  <ArrowDown size={14} />
                </button>
                <button className="btn-ghost !min-h-[36px] px-1.5 text-danger" aria-label="Remove" onClick={() => removeItem.mutate(item.id)}>
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={finderOpen} onClose={() => setFinderOpen(false)} title="Find songs" wide>
        <p className="text-xs text-soft mb-3">
          {data.setList.length} in the set · {data.shortlist.length} considering. <Star size={11} className="inline text-accent" /> to consider, <Plus size={11} className="inline" /> to add to the set.
        </p>
        {library ? (
          <SongFinder
            library={library}
            inSet={inSet}
            considering={considering}
            nearby={data.nearby}
            setKeys={setKeys}
            tagNames={tagNames}
            topArtists={topArtists}
            views={views ?? []}
            busy={busy}
            onAdd={(id) => addSong.mutate(id)}
            onConsider={(id, on) => consider.mutate({ songId: id, on })}
          />
        ) : (
          <p className="text-sm text-soft">Opening the song library…</p>
        )}
      </Modal>

      <Modal open={addItemOpen} onClose={() => setAddItemOpen(false)} title="Add a running-order item">
        <OrderItemForm busy={addItem.isPending} onSave={(t, title, m) => addItem.mutate({ type: t, title, minutes: m })} />
      </Modal>
    </section>
  );
}

/** Leads pick from the song's stored female/male keys; custom only by exception. */
function KeyPicker({
  femaleKey,
  maleKey,
  current,
  onPick,
}: {
  femaleKey: string | null;
  maleKey: string | null;
  current: string | null;
  onPick: (key: string) => void;
}) {
  const [custom, setCustom] = useState(false);
  const isFemale = !current || current === femaleKey;
  const isMale = current != null && current === maleKey && maleKey !== femaleKey;
  const value = custom ? "custom" : isFemale ? "female" : isMale ? "male" : "custom";

  if (value === "custom" || custom) {
    return (
      <span className="flex items-center gap-1">
        <input
          className="input !min-h-[36px] !w-14 text-center text-xs"
          defaultValue={current ?? ""}
          placeholder="key"
          autoFocus={custom}
          aria-label="Custom key"
          onBlur={(e) => {
            setCustom(false);
            onPick(e.target.value.trim());
          }}
        />
      </span>
    );
  }
  return (
    <select
      className="input !min-h-[36px] !w-28 text-xs !px-1.5"
      value={value}
      aria-label="Song key"
      onChange={(e) => {
        if (e.target.value === "female") onPick("");
        else if (e.target.value === "male") onPick(maleKey ?? "");
        else setCustom(true);
      }}
    >
      <option value="female">Female · {femaleKey ?? "—"}</option>
      <option value="male" disabled={!maleKey}>Male · {maleKey ?? "—"}</option>
      <option value="custom">Custom…</option>
    </select>
  );
}

function OrderItemForm({ onSave, busy }: { onSave: (type: string, title: string, minutes: number | null) => void; busy: boolean }) {
  const [type, setType] = useState<string>("song");
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("");
  return (
    <div className="space-y-3">
      <Field label="Type">
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          {ITEM_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="Title">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Welcome & notices" />
      </Field>
      <Field label="Duration (minutes, optional)">
        <input className="input" type="number" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      </Field>
      <button
        className="btn-primary w-full"
        disabled={busy || !title.trim()}
        onClick={() => onSave(type, title.trim(), minutes ? Number(minutes) : null)}
      >
        Add to running order
      </button>
    </div>
  );
}
