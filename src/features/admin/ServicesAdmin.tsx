// SVC-2/3/4: all services incl. drafts/archived; one-offs; cancel; soft-archive.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Badge, Card, Field, Modal, PageHeader, Spinner, statusBadgeTone } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";
import type { TablesUpdate } from "@/lib/supabase/database.types";

export default function ServicesAdmin() {
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-services", showArchived],
    queryFn: async () => {
      let q = supabase.from("services").select("*").order("service_date", { ascending: false }).limit(100);
      if (!showArchived) q = q.is("archived_at", null);
      const [services, team] = await Promise.all([q, supabase.from("teams").select("id").limit(1).single()]);
      return { services: services.data ?? [], teamId: team.data?.id as string };
    },
  });

  const create = useMutation({
    mutationFn: async (args: { title: string; date: string; time: string }) => {
      const { error } = await supabase.from("services").insert({
        team_id: data!.teamId,
        title: args.title,
        service_date: args.date,
        start_time: args.time,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-services"] });
      setNewOpen(false);
    },
  });

  const patch = useMutation({
    mutationFn: async (args: { id: string; patch: TablesUpdate<"services"> }) => {
      const { error } = await supabase.from("services").update(args.patch).eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-services"] }),
  });

  // Change request #1: select multiple services, apply one status/lock change
  const bulkPatch = useMutation({
    mutationFn: async (p: TablesUpdate<"services">) => {
      const { error } = await supabase.from("services").update(p).in("id", [...selected]);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-services"] });
      setSelected(new Set());
      setBulkAction("");
    },
  });

  const BULK_ACTIONS: Record<string, TablesUpdate<"services">> = {
    open_availability: { status: "availability_open", availability_locked: false },
    lock_availability: { availability_locked: true },
    open_scheduling: { status: "scheduling_open" },
    publish: { status: "published", scheduling_locked: true },
    unlock_scheduling: { scheduling_locked: false, status: "scheduling_open" },
    cancel: { status: "cancelled" },
  };

  if (isLoading) return <Spinner label="Loading services…" />;

  return (
    <div className="space-y-4">
      <PageHeader
        back="/admin"
        title="All services"
        subtitle="Including drafts and archived — nothing is ever hard-deleted."
        action={
          <button className="btn-primary" onClick={() => setNewOpen(true)}>
            <Plus size={16} /> One-off service
          </button>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-soft min-h-[44px]">
          <input type="checkbox" className="w-4 h-4" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{selected.size} selected</span>
            <select className="input !min-h-[40px] !w-auto text-sm" value={bulkAction} onChange={(e) => setBulkAction(e.target.value)} aria-label="Bulk action">
              <option value="">Bulk action…</option>
              <option value="open_availability">Open availability</option>
              <option value="lock_availability">Lock availability</option>
              <option value="open_scheduling">Open scheduling</option>
              <option value="publish">Publish & lock</option>
              <option value="unlock_scheduling">Unlock scheduling</option>
              <option value="cancel">Cancel</option>
            </select>
            <button
              className="btn-primary !min-h-[40px]"
              disabled={!bulkAction || bulkPatch.isPending}
              onClick={() => bulkPatch.mutate(BULK_ACTIONS[bulkAction])}
            >
              Apply
            </button>
          </div>
        )}
      </div>

      <Card className="!p-0 divide-y divide-line">
        {data!.services.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-3">
            <input
              type="checkbox"
              className="w-4 h-4 shrink-0"
              aria-label={`Select ${s.title}`}
              checked={selected.has(s.id)}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(s.id);
                else next.delete(s.id);
                setSelected(next);
              }}
            />
            <Link to={`/team-lead/services/${s.id}/build`} className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{s.title}</p>
              <p className="text-soft text-xs">
                {formatDate(s.service_date)} · {formatTime(s.start_time)}
              </p>
            </Link>
            <Badge tone={statusBadgeTone(s.status)}>{s.status.replace(/_/g, " ")}</Badge>
            {s.archived_at ? (
              <Badge tone="neutral">archived</Badge>
            ) : (
              <div className="flex gap-1">
                {s.status !== "cancelled" && (
                  <button
                    className="btn-ghost !min-h-[38px] text-xs text-danger"
                    onClick={() => {
                      if (window.confirm("Cancel this service? All assigned volunteers will be notified."))
                        patch.mutate({ id: s.id, patch: { status: "cancelled" } });
                    }}
                  >
                    Cancel
                  </button>
                )}
                <button
                  className="btn-ghost !min-h-[38px] text-xs"
                  onClick={() => patch.mutate({ id: s.id, patch: { archived_at: new Date().toISOString() } })}
                >
                  Archive
                </button>
              </div>
            )}
          </div>
        ))}
      </Card>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Create a one-off service">
        <OneOffForm busy={create.isPending} onSave={(title, date, time) => create.mutate({ title, date, time })} />
      </Modal>
    </div>
  );
}

function OneOffForm({ onSave, busy }: { onSave: (title: string, date: string, time: string) => void; busy: boolean }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:30");
  return (
    <div className="space-y-3">
      <Field label="Title">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Carols by Candlelight" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Start time">
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <button className="btn-primary w-full" disabled={busy || !title.trim() || !date} onClick={() => onSave(title.trim(), date, time)}>
        Create draft service
      </button>
      <p className="text-faint text-xs">Created as a draft — add role requirements in the rota builder, then open availability.</p>
    </div>
  );
}
