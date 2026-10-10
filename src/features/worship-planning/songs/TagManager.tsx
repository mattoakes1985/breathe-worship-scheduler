// Tag management: create, rename (ripples through every song), archive.
// Bulk tagging of many songs lives in the library's select mode.
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Tag } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Card, ErrorState, Spinner } from "@/components/ui";
import { invalidateSongs, songErrorMessage, useSongLibrary, useSongTags } from "./data";

export default function TagManager({ onShowTag }: { onShowTag: (tag: string) => void }) {
  const qc = useQueryClient();
  const { data: tags, isLoading, error, refetch } = useSongTags();
  const { data: songs } = useSongLibrary();
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of songs ?? []) if (s.is_active) for (const t of s.tags ?? []) m.set(t.toLowerCase(), (m.get(t.toLowerCase()) ?? 0) + 1);
    return m;
  }, [songs]);
  const live = (tags ?? []).filter((t) => !t.archived_at);
  const archived = (tags ?? []).filter((t) => t.archived_at);
  const orphan = [...counts.keys()].filter((k) => !(tags ?? []).some((t) => t.name.toLowerCase() === k));

  const done = (msg: string) => {
    setMessage(msg);
    invalidateSongs(qc);
  };
  const onErr = (e: unknown) => setMessage(songErrorMessage(e));

  const create = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.rpc("create_song_tag", { p_name: name });
      if (error) throw error;
    },
    onSuccess: (_d, name) => {
      setNewName("");
      done(`“${name}” is in the tag list.`);
    },
    onError: onErr,
  });
  const rename = useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      const { data, error } = await supabase.rpc("rename_song_tag", { p_old: from, p_new: to });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n, v) => {
      setRenaming(null);
      done(`Renamed “${v.from}” to “${v.to}” on ${n} ${n === 1 ? "song" : "songs"}.`);
    },
    onError: onErr,
  });
  const archive = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.rpc("archive_song_tag", { p_name: name });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n, name) => {
      setConfirmArchive(null);
      done(`Archived “${name}” and took it off ${n} ${n === 1 ? "song" : "songs"}. Each song's history still shows it.`);
    },
    onError: onErr,
  });

  if (isLoading) return <Spinner label="Loading tags…" />;
  if (error) return <ErrorState message={songErrorMessage(error)} retry={() => refetch()} />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-soft">
        Tags are your genres and themes (Fast, Communion, Christmas…). To tag lots of songs at once, use <strong>Select</strong> in the library.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim()) create.mutate(newName.trim());
        }}
      >
        <input className="input" placeholder="New tag name" maxLength={40} value={newName} onChange={(e) => setNewName(e.target.value.replace(/,/g, ""))} />
        <button className="btn-primary shrink-0" disabled={!newName.trim() || create.isPending}>
          Add tag
        </button>
      </form>
      {message && <p className="text-sm text-soft bg-raised rounded-md px-3 py-2" role="status">{message}</p>}

      <Card className="!p-0 divide-y divide-line">
        {live.map((t) => {
          const n = counts.get(t.name.toLowerCase()) ?? 0;
          return (
            <div key={t.id} className="px-4 py-2.5 flex flex-wrap items-center gap-2">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: t.color ?? "rgb(var(--c-text-3))" }} aria-hidden />
              {renaming?.from === t.name ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (renaming.to.trim() && renaming.to.trim() !== t.name) rename.mutate({ from: t.name, to: renaming.to.trim() });
                  }}
                >
                  <input className="input !min-h-[40px]" autoFocus maxLength={40} value={renaming.to} onChange={(e) => setRenaming({ from: t.name, to: e.target.value.replace(/,/g, "") })} />
                  <button className="btn-primary !min-h-[40px]" disabled={rename.isPending}>Save</button>
                  <button type="button" className="btn-ghost !min-h-[40px]" onClick={() => setRenaming(null)}>Cancel</button>
                </form>
              ) : (
                <>
                  <button className="flex-1 text-left font-semibold text-sm min-h-0" onClick={() => onShowTag(t.name)} title="Show these songs">
                    {t.name} <span className="text-faint font-normal">· {n} {n === 1 ? "song" : "songs"}</span>
                  </button>
                  {confirmArchive === t.name ? (
                    <span className="flex items-center gap-1 text-sm">
                      {n > 0 ? `Remove from ${n} songs?` : "Archive?"}
                      <button className="btn-danger !min-h-[36px] px-3" disabled={archive.isPending} onClick={() => archive.mutate(t.name)}>Yes</button>
                      <button className="btn-ghost !min-h-[36px] px-2" onClick={() => setConfirmArchive(null)}>No</button>
                    </span>
                  ) : (
                    <>
                      <button className="btn-ghost !min-h-[36px] px-2 text-sm" onClick={() => setRenaming({ from: t.name, to: t.name })}>Rename</button>
                      <button className="btn-ghost !min-h-[36px] px-2 text-sm" onClick={() => setConfirmArchive(t.name)}>Archive</button>
                    </>
                  )}
                </>
              )}
            </div>
          );
        })}
      </Card>

      {orphan.length > 0 && (
        <Card className="space-y-2">
          <h3 className="font-semibold text-sm">Used on songs but not in the tag list</h3>
          <div className="flex flex-wrap gap-1.5">
            {orphan.map((o) => (
              <button key={o} className="chip min-h-[36px] bg-raised text-soft" onClick={() => create.mutate(o.replace(/^./, (c) => c.toUpperCase()))}>
                <Tag size={12} /> {o} · add to list
              </button>
            ))}
          </div>
        </Card>
      )}
      {archived.length > 0 && (
        <p className="text-xs text-faint">
          Archived tags: {archived.map((t) => t.name).join(", ")} — add one again with the same name to bring it back.
        </p>
      )}
    </div>
  );
}
