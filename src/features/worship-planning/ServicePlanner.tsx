// Change request #8: worship-planning editor on the service detail screen.
// Visible to Team Leads/Admins once a service exists — assign songs (WOR-2)
// and build the running order (WOR-3) in place.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ListMusic, Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Card, Field, Modal } from "@/components/ui";
import type { Tables } from "@/lib/supabase/database.types";

const ITEM_TYPES = ["song", "sermon", "announcement", "communion", "offering", "custom"] as const;

export default function ServicePlanner({ serviceId }: { serviceId: string }) {
  const qc = useQueryClient();
  const [addSongOpen, setAddSongOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data } = useQuery({
    queryKey: ["service-planner", serviceId],
    queryFn: async () => {
      const [songs, library, order] = await Promise.all([
        supabase
          .from("service_songs")
          .select("*, songs(title,artist,default_key,male_key)")
          .eq("service_id", serviceId)
          .order("order_index"),
        supabase.from("songs").select("*").eq("is_active", true).order("title"),
        supabase.from("service_order_items").select("*").eq("service_id", serviceId).order("order_index"),
      ]);
      return {
        setList: songs.data ?? [],
        library: (library.data ?? []) as Tables<"songs">[],
        order: order.data ?? [],
      };
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["service-planner", serviceId] });
    qc.invalidateQueries({ queryKey: ["service-detail", serviceId] });
  };

  const addSong = useMutation({
    mutationFn: async (songId: string) => {
      const { error } = await supabase.from("service_songs").insert({
        service_id: serviceId,
        song_id: songId,
        order_index: (data?.setList.length ?? 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setAddSongOpen(false);
      setSearch("");
    },
  });

  const removeSong = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_songs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const setKeyOverride = useMutation({
    mutationFn: async (args: { id: string; key: string }) => {
      const { error } = await supabase
        .from("service_songs")
        .update({ key_override: args.key || null })
        .eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
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
    onSuccess: invalidate,
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
      invalidate();
      setAddItemOpen(false);
    },
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_order_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
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
    onSuccess: invalidate,
  });

  const filteredLibrary = useMemo(() => {
    const q = search.trim().toLowerCase();
    const inSet = new Set((data?.setList ?? []).map((s) => s.song_id));
    return (data?.library ?? [])
      .filter((s) => !inSet.has(s.id))
      .filter((s) => !q || s.title.toLowerCase().includes(q) || (s.artist ?? "").toLowerCase().includes(q))
      .slice(0, 30);
  }, [data, search]);

  if (!data) return null;

  return (
    <section aria-label="Plan worship">
      <h2 className="flex items-center gap-2 font-display font-bold text-sm uppercase tracking-wide text-faint mb-2">
        <ListMusic size={14} /> Plan worship <span className="chip bg-accent-soft text-accent-strong normal-case">lead tools</span>
      </h2>
      <Card>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display font-bold text-sm">Song set</h3>
          <button className="btn-secondary !min-h-[38px]" onClick={() => setAddSongOpen(true)}>
            <Plus size={14} /> Add song
          </button>
        </div>
        {data.setList.length === 0 ? (
          <p className="text-faint text-sm">No songs yet — add from the library.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.setList.map((ss, i) => {
              const song = ss.songs as { title: string; artist: string | null; default_key: string | null; male_key: string | null } | null;
              return (
                <li key={ss.id} className="flex items-center gap-2 py-2">
                  <span className="text-faint font-display font-bold w-4 text-center text-sm">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{song?.title}</p>
                    <p className="text-faint text-xs">
                      {song?.artist ?? ""} · F:{song?.default_key ?? "—"} M:{song?.male_key ?? "—"}
                    </p>
                  </div>
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
                  <button className="btn-ghost !min-h-[36px] px-1.5 text-danger" aria-label="Remove" onClick={() => removeSong.mutate(ss.id)}>
                    <X size={14} />
                  </button>
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

      <Modal open={addSongOpen} onClose={() => setAddSongOpen(false)} title="Add a song to this service">
        <input
          className="input mb-3"
          placeholder="Search the library…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <ul className="space-y-1.5 max-h-72 overflow-y-auto">
          {filteredLibrary.map((s) => (
            <li key={s.id}>
              <button
                className="w-full text-left card p-3 flex items-center justify-between hover:shadow-raised transition-shadow"
                onClick={() => addSong.mutate(s.id)}
                disabled={addSong.isPending}
              >
                <span>
                  <span className="block font-semibold text-sm">{s.title}</span>
                  <span className="block text-faint text-xs">{s.artist ?? ""}</span>
                </span>
                <span className="chip bg-accent-soft text-accent-strong">
                  {s.default_key ?? "—"}{s.male_key ? ` / ${s.male_key}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
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
      className="input !min-h-[36px] !w-24 text-xs !px-1.5"
      value={value}
      aria-label="Song key"
      onChange={(e) => {
        if (e.target.value === "female") onPick("");
        else if (e.target.value === "male") onPick(maleKey ?? "");
        else setCustom(true);
      }}
    >
      <option value="female">F · {femaleKey ?? "—"}</option>
      <option value="male" disabled={!maleKey}>M · {maleKey ?? "—"}</option>
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
