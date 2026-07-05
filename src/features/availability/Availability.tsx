// AVAIL-1/2: per-service Yes/No/Maybe + note, and standing blockout dates.
// The most-used volunteer flow — must finish in seconds (§10.3).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarOff, CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, EmptyState, Field, Modal, PageHeader, Spinner } from "@/components/ui";
import { formatDate, formatTime, todayISO } from "@/lib/format";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function Availability() {
  const { session } = useAuth();
  const uid = session!.user.id;
  const qc = useQueryClient();
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [blockoutOpen, setBlockoutOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["availability", uid],
    queryFn: async () => {
      const [services, responses, blockouts] = await Promise.all([
        supabase
          .from("services")
          .select("id,title,service_date,start_time,scheduling_locked")
          .eq("status", "availability_open")
          .gte("service_date", todayISO())
          .order("service_date"),
        supabase.from("availability_responses").select("*").eq("profile_id", uid),
        supabase.from("blockout_dates").select("*").eq("profile_id", uid).order("created_at"),
      ]);
      return {
        services: services.data ?? [],
        responses: new Map((responses.data ?? []).map((r) => [r.service_id, r])),
        blockouts: blockouts.data ?? [],
      };
    },
  });

  const respond = useMutation({
    mutationFn: async (args: { serviceId: string; response: "yes" | "no" | "maybe"; note?: string }) => {
      const { error } = await supabase.from("availability_responses").upsert(
        {
          service_id: args.serviceId,
          profile_id: uid,
          response: args.response,
          note: args.note ?? null,
          responded_at: new Date().toISOString(),
        },
        { onConflict: "service_id,profile_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["availability"] }),
  });

  const addBlockout = useMutation({
    mutationFn: async (b: { start_date: string | null; end_date: string | null; recurring_day_of_week: number | null; reason: string | null }) => {
      const { error } = await supabase.from("blockout_dates").insert({ ...b, profile_id: uid });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["availability"] });
      setBlockoutOpen(false);
    },
  });

  const removeBlockout = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blockout_dates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["availability"] }),
  });

  if (isLoading) return <Spinner label="Loading availability requests…" />;

  const options = [
    { value: "yes" as const, label: "Yes", icon: CheckCircle2, active: "bg-positive text-white border-positive" },
    { value: "maybe" as const, label: "Maybe", icon: HelpCircle, active: "bg-info text-white border-info" },
    { value: "no" as const, label: "No", icon: XCircle, active: "bg-danger text-white border-danger" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Availability"
        subtitle="Tap once per service — you can change your answer until scheduling locks."
        action={
          <button className="btn-secondary" onClick={() => setBlockoutOpen(true)}>
            <CalendarOff size={16} /> Blockouts
          </button>
        }
      />

      {data!.services.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 />}
          title="All caught up"
          body="No services are asking for your availability right now. We'll notify you when the next one opens."
        />
      ) : (
        <div className="space-y-3">
          {data!.services.map((s) => {
            const mine = data!.responses.get(s.id);
            return (
              <Card key={s.id}>
                <p className="font-semibold">{s.title}</p>
                <p className="text-soft text-sm mb-3">
                  {formatDate(s.service_date)} · {formatTime(s.start_time)}
                </p>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={`Availability for ${s.title}`}>
                  {options.map(({ value, label, icon: Icon, active }) => (
                    <button
                      key={value}
                      role="radio"
                      aria-checked={mine?.response === value}
                      className={`btn border ${
                        mine?.response === value ? active : "bg-surface border-line text-soft hover:bg-raised"
                      }`}
                      disabled={s.scheduling_locked || respond.isPending}
                      onClick={() => respond.mutate({ serviceId: s.id, response: value, note: mine?.note ?? undefined })}
                    >
                      <Icon size={16} /> {label}
                    </button>
                  ))}
                </div>
                <button
                  className="text-accent-strong text-xs font-semibold mt-2"
                  onClick={() => {
                    setNoteFor(s.id);
                    setNote(mine?.note ?? "");
                  }}
                >
                  {mine?.note ? `Note: ${mine.note} (edit)` : "+ Add a note"}
                </button>
              </Card>
            );
          })}
        </div>
      )}

      <section>
        <h2 className="font-display font-bold text-sm uppercase tracking-wide text-faint mb-2">
          Standing blockouts
        </h2>
        {data!.blockouts.length === 0 ? (
          <p className="text-soft text-sm">
            None set. Blockouts stop you being asked (or auto-suggested) for dates you can never do.
          </p>
        ) : (
          <ul className="space-y-2">
            {data!.blockouts.map((b) => (
              <li key={b.id} className="card flex items-center justify-between p-3 text-sm">
                <span>
                  {b.recurring_day_of_week !== null
                    ? `Every ${DAYS[b.recurring_day_of_week]}`
                    : `${formatDate(b.start_date)} → ${formatDate(b.end_date)}`}
                  {b.reason && <span className="text-faint"> · {b.reason}</span>}
                </span>
                <button className="text-danger text-xs font-semibold min-h-[44px] px-2" onClick={() => removeBlockout.mutate(b.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={noteFor !== null} onClose={() => setNoteFor(null)} title="Add a note">
        <Field label="Note for your team lead" hint="e.g. 'Can do the morning but need to leave by 12'">
          <textarea className="input py-2.5" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button
          className="btn-primary w-full mt-4"
          onClick={() => {
            const existing = data!.responses.get(noteFor!);
            respond.mutate({
              serviceId: noteFor!,
              response: (existing?.response as "yes" | "no" | "maybe") ?? "maybe",
              note,
            });
            setNoteFor(null);
          }}
        >
          Save note
        </button>
      </Modal>

      <BlockoutModal
        open={blockoutOpen}
        onClose={() => setBlockoutOpen(false)}
        onSave={(b) => addBlockout.mutate(b)}
        busy={addBlockout.isPending}
      />
    </div>
  );
}

function BlockoutModal({
  open,
  onClose,
  onSave,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (b: { start_date: string | null; end_date: string | null; recurring_day_of_week: number | null; reason: string | null }) => void;
  busy: boolean;
}) {
  const [kind, setKind] = useState<"range" | "weekly">("range");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [dow, setDow] = useState(0);
  const [reason, setReason] = useState("");

  return (
    <Modal open={open} onClose={onClose} title="Add a blockout">
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button className={kind === "range" ? "btn-primary" : "btn-secondary"} onClick={() => setKind("range")}>
          Date range
        </button>
        <button className={kind === "weekly" ? "btn-primary" : "btn-secondary"} onClick={() => setKind("weekly")}>
          Every week
        </button>
      </div>
      {kind === "range" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <input type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="To">
            <input type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
      ) : (
        <Field label="Day of week">
          <select className="input" value={dow} onChange={(e) => setDow(Number(e.target.value))}>
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="mt-3">
        <Field label="Reason (optional)">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
      <button
        className="btn-primary w-full mt-4"
        disabled={busy || (kind === "range" && (!start || !end))}
        onClick={() =>
          onSave(
            kind === "range"
              ? { start_date: start, end_date: end, recurring_day_of_week: null, reason: reason || null }
              : { start_date: null, end_date: null, recurring_day_of_week: dow, reason: reason || null }
          )
        }
      >
        Save blockout
      </button>
    </Modal>
  );
}
