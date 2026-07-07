// PPL-2: role management within Breathe Worship — add/rename/deactivate.
// Deliberately NOT a "create a team" screen (D2; that's Phase 2).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Badge, Card, Field, Modal, PageHeader, Spinner } from "@/components/ui";

export default function RolesAdmin() {
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const [roles, team] = await Promise.all([
        supabase.from("roles").select("*").order("sort_order"),
        supabase.from("teams").select("id,name").limit(1).single(),
      ]);
      return { roles: roles.data ?? [], team: team.data };
    },
  });

  const save = useMutation({
    mutationFn: async (args: { id?: string; name?: string; is_active?: boolean; sort_order?: number }) => {
      if (args.id) {
        const { error } = await supabase
          .from("roles")
          .update({ name: args.name, is_active: args.is_active, sort_order: args.sort_order })
          .eq("id", args.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("roles")
          .insert({ name: args.name!, sort_order: args.sort_order ?? 0, team_id: data!.team!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-roles"] });
      setNewOpen(false);
      setName("");
    },
  });

  if (isLoading) return <Spinner label="Loading roles…" />;

  return (
    <div className="space-y-4">
      <PageHeader
        back="/admin"
        title="Roles"
        subtitle={`Serving roles within ${data!.team?.name ?? "the team"}.`}
        action={
          <button className="btn-primary" onClick={() => setNewOpen(true)}>
            <Plus size={16} /> Add role
          </button>
        }
      />
      <Card className="!p-0 divide-y divide-line">
        {data!.roles.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-3">
            <input
              className="input !min-h-[40px] flex-1 !border-transparent hover:!border-line focus:!border-accent bg-transparent"
              defaultValue={r.name}
              aria-label={`Rename ${r.name}`}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== r.name)
                  save.mutate({ id: r.id, name: e.target.value.trim() });
              }}
            />
            {!r.is_active && <Badge tone="danger">inactive</Badge>}
            <button
              className="btn-ghost !min-h-[40px] text-xs"
              onClick={() => save.mutate({ id: r.id, is_active: !r.is_active })}
            >
              {r.is_active ? "Deactivate" : "Reactivate"}
            </button>
          </div>
        ))}
      </Card>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Add a role">
        <Field label="Role name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <button
          className="btn-primary w-full mt-4"
          disabled={!name.trim() || save.isPending}
          onClick={() => save.mutate({ name: name.trim(), sort_order: (data!.roles.length ?? 0) + 1 })}
        >
          Add role
        </button>
      </Modal>
    </div>
  );
}
