// SVC-1/2: recurring service templates + generate services for a date range.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Card, Field, Modal, PageHeader, Spinner } from "@/components/ui";
import { formatDate } from "@/lib/format";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function Templates() {
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [genFor, setGenFor] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-templates"],
    queryFn: async () => {
      const [templates, roles, reqs, team] = await Promise.all([
        supabase.from("service_templates").select("*").eq("is_active", true).order("name"),
        supabase.from("roles").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("template_role_requirements").select("*"),
        supabase.from("teams").select("id").limit(1).single(),
      ]);
      return {
        templates: templates.data ?? [],
        roles: roles.data ?? [],
        reqs: reqs.data ?? [],
        teamId: team.data?.id as string,
      };
    },
  });

  const createTemplate = useMutation({
    mutationFn: async (args: { name: string; time: string; roleIds: string[] }) => {
      const { data: tpl, error } = await supabase
        .from("service_templates")
        .insert({ team_id: data!.teamId, name: args.name, default_start_time: args.time })
        .select()
        .single();
      if (error) throw error;
      if (args.roleIds.length) {
        const { error: e2 } = await supabase
          .from("template_role_requirements")
          .insert(args.roleIds.map((role_id) => ({ template_id: tpl.id, role_id })));
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-templates"] });
      setNewOpen(false);
    },
  });

  const generate = useMutation({
    mutationFn: async (args: { templateId: string; dates: string[] }) => {
      const { data: created, error } = await supabase.rpc("generate_services_from_template", {
        p_template_id: args.templateId,
        p_dates: args.dates,
      });
      if (error) throw error;
      return created;
    },
    onSuccess: (created) => {
      setGenFor(null);
      setMsg(`Created ${created?.length ?? 0} services (as drafts — open Team Lead to progress them).`);
      qc.invalidateQueries();
    },
    onError: (e) => setMsg((e as Error).message),
  });

  if (isLoading) return <Spinner label="Loading templates…" />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Service templates"
        subtitle="Patterns that generate services — the template itself is not a calendar event."
        action={
          <button className="btn-primary" onClick={() => setNewOpen(true)}>
            <Plus size={16} /> New template
          </button>
        }
      />
      {msg && <p className="card p-3 text-sm text-soft">{msg}</p>}

      {data!.templates.length === 0 ? (
        <Card>
          <p className="text-soft text-sm">
            No templates yet. Create "Sunday 10:30 Service" once, then generate a month of services in
            two clicks.
          </p>
        </Card>
      ) : (
        data!.templates.map((t) => (
          <Card key={t.id} className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-sm">{t.name}</p>
              <p className="text-soft text-xs">
                {t.default_start_time?.slice(0, 5) ?? "no default time"} ·{" "}
                {data!.reqs.filter((r) => r.template_id === t.id).length} role requirements
              </p>
            </div>
            <button className="btn-secondary" onClick={() => setGenFor(t.id)}>
              <CalendarPlus size={16} /> Generate
            </button>
          </Card>
        ))
      )}

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New service template">
        <TemplateForm
          roles={data!.roles}
          busy={createTemplate.isPending}
          onSave={(name, time, roleIds) => createTemplate.mutate({ name, time, roleIds })}
        />
      </Modal>

      <Modal open={genFor !== null} onClose={() => setGenFor(null)} title="Generate services">
        <GenerateForm busy={generate.isPending} onGenerate={(dates) => generate.mutate({ templateId: genFor!, dates })} />
      </Modal>
    </div>
  );
}

function TemplateForm({
  roles,
  onSave,
  busy,
}: {
  roles: { id: string; name: string }[];
  onSave: (name: string, time: string, roleIds: string[]) => void;
  busy: boolean;
}) {
  const [name, setName] = useState("Sunday 10:30 Service");
  const [time, setTime] = useState("10:30");
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set(roles.map((r) => r.id)));
  return (
    <div className="space-y-3">
      <Field label="Name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Default start time">
        <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </Field>
      <Field label="Roles needed (1 each — adjust per service later)">
        <div className="flex flex-wrap gap-2">
          {roles.map((r) => {
            const on = roleIds.has(r.id);
            return (
              <button
                key={r.id}
                className={`chip min-h-[36px] ${on ? "bg-accent text-white" : "bg-raised text-soft"}`}
                onClick={() => {
                  const next = new Set(roleIds);
                  if (on) next.delete(r.id);
                  else next.add(r.id);
                  setRoleIds(next);
                }}
              >
                {r.name}
              </button>
            );
          })}
        </div>
      </Field>
      <button className="btn-primary w-full" disabled={busy || !name.trim()} onClick={() => onSave(name, time, [...roleIds])}>
        Create template
      </button>
    </div>
  );
}

function GenerateForm({ onGenerate, busy }: { onGenerate: (dates: string[]) => void; busy: boolean }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dow, setDow] = useState(0);

  const dates: string[] = [];
  if (from && to) {
    const d = new Date(from + "T00:00:00");
    const end = new Date(to + "T00:00:00");
    while (d <= end) {
      if (d.getDay() === dow) dates.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <Field label="On every">
        <select className="input" value={dow} onChange={(e) => setDow(Number(e.target.value))}>
          {DAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
      </Field>
      {dates.length > 0 && (
        <p className="text-soft text-xs">
          Will create {dates.length} services: {dates.slice(0, 3).map(formatDate).join(", ")}
          {dates.length > 3 ? "…" : ""}
        </p>
      )}
      <button className="btn-primary w-full" disabled={busy || dates.length === 0} onClick={() => onGenerate(dates)}>
        {busy ? "Creating…" : `Generate ${dates.length || ""} services`}
      </button>
    </div>
  );
}
