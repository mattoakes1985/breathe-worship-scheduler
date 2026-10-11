// One dropdown for choosing who fills a slot, used by the month plan and the
// month grid. Grouped so the obvious choices come first, but anyone on the
// team (even archived, or not listed for this instrument) can be picked by
// hand. Hand picks are never made by the planner itself.
import type { Person } from "./data";

export default function PersonPicker({
  roleId, value, people, response, onService, onChange, ariaLabel, className = "",
}: {
  roleId: string;
  value: string | null;
  people: Person[];
  response: Map<string, string>;
  onService: Set<string>;
  onChange: (personId: string | null) => void;
  ariaLabel: string;
  className?: string;
}) {
  const active = people.filter((p) => p.is_active);
  const players = active.filter((p) => roleId in p.roles);
  const others = active.filter((p) => !(roleId in p.roles));
  const archived = people.filter((p) => !p.is_active);
  const groups: [string, Person[], string][] = [
    ["Said yes", players.filter((p) => response.get(p.id) === "yes"), ""],
    ["Said maybe", players.filter((p) => response.get(p.id) === "maybe"), ""],
    ["Plays this — no answer", players.filter((p) => !response.has(p.id)), ""],
    ["Plays this — said no", players.filter((p) => response.get(p.id) === "no"), ""],
    ["Everyone else on the team", others, " (not listed for this)"],
    ["Archived", archived, " (archived)"],
  ];
  return (
    <select className={`input !min-h-[40px] !py-1 text-sm ${!value ? "text-faint" : ""} ${className}`} aria-label={ariaLabel} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">— nobody —</option>
      {groups.map(([label, list, suffix]) =>
        list.length ? (
          <optgroup key={label} label={label}>
            {list.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}{suffix}{onService.has(p.id) && p.id !== value ? " (already on)" : ""}
              </option>
            ))}
          </optgroup>
        ) : null
      )}
    </select>
  );
}
