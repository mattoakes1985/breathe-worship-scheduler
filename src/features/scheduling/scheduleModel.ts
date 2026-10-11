// Master schedule — pure logic. Who's serving on a service comes from, in
// order of preference:
//   1. the band published from the planner (services.published_rota, names),
//   2. app assignments (people with accounts),
//   3. spreadsheet-era history (legacy_assignments),
//   4. for planners only, the unpublished plan (rota_plan_slots).
// Mixing sources for one service would double-count people, so the first
// source that has anyone wins.

export type BandSource = "published" | "assignments" | "history" | "plan" | "none";
export interface BandLine {
  role: string;
  names: string[];
  /** someone in this role has asked for cover */
  needsCover?: boolean;
}
export interface Band {
  source: BandSource;
  lines: BandLine[];
}

export interface RoleRef {
  name: string;
  sort_order: number;
}
export interface PersonInRole {
  role: RoleRef | null;
  name: string | null | undefined;
  needsCover?: boolean;
}

function group(entries: PersonInRole[], roleOrder: Map<string, number>): BandLine[] {
  const lines: (BandLine & { order: number; first: number })[] = [];
  entries.forEach((e, i) => {
    const name = e.name?.trim();
    if (!name) return;
    const role = e.role?.name ?? "Serving";
    let line = lines.find((l) => l.role === role);
    if (!line) {
      line = { role, names: [], order: e.role?.sort_order ?? roleOrder.get(role) ?? 999, first: i };
      lines.push(line);
    }
    if (!line.names.includes(name)) line.names.push(name);
    if (e.needsCover) line.needsCover = true;
  });
  return lines.sort((a, b) => a.order - b.order || a.first - b.first).map(({ role, names, needsCover }) => (needsCover ? { role, names, needsCover } : { role, names }));
}

export function buildBand(args: {
  publishedRota: unknown;
  assignments: PersonInRole[];
  legacy: PersonInRole[];
  plan?: PersonInRole[];
  roleOrder: Map<string, number>;
}): Band {
  const rota = Array.isArray(args.publishedRota) ? (args.publishedRota as { role?: string; name?: string }[]) : [];
  const published = group(
    rota.map((r) => ({ role: r.role ? { name: r.role, sort_order: args.roleOrder.get(r.role) ?? 999 } : null, name: r.name })),
    args.roleOrder
  );
  // Cover requests still matter on a published band.
  if (published.length) {
    const cover = new Set(args.assignments.filter((a) => a.needsCover).map((a) => a.role?.name));
    return { source: "published", lines: published.map((l) => (cover.has(l.role) ? { ...l, needsCover: true } : l)) };
  }
  const a = group(args.assignments, args.roleOrder);
  if (a.length) return { source: "assignments", lines: a };
  const h = group(args.legacy, args.roleOrder);
  if (h.length) return { source: "history", lines: h };
  const p = group(args.plan ?? [], args.roleOrder);
  if (p.length) return { source: "plan", lines: p };
  return { source: "none", lines: [] };
}

export interface SetSong {
  order: number;
  title: string;
  key: string | null;
}

/** "Echoes (G), No Body (A)" */
export function setLine(songs: SetSong[]): string {
  return [...songs].sort((a, b) => a.order - b.order).map((s) => (s.key ? `${s.title} (${s.key})` : s.title)).join(", ");
}

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export interface CsvService {
  date: string;
  time: string;
  title: string;
  theme?: string | null;
  preacher?: string | null;
  band: Band;
  songs: SetSong[];
}

/** One row per person per role, then one row per song, per service. */
export function scheduleCsv(services: CsvService[]): string {
  const lines = ["Date,Time,Service,Theme,Preacher,Role,Name"];
  for (const s of services) {
    const pre = [s.date, s.time, esc(s.title), esc(s.theme ?? ""), esc(s.preacher ?? "")];
    let rows = 0;
    for (const l of s.band.lines) for (const n of l.names) { lines.push([...pre, esc(l.role), esc(n)].join(",")); rows++; }
    [...s.songs].sort((a, b) => a.order - b.order).forEach((song, i) => {
      lines.push([...pre, `Song ${i + 1}`, esc(song.key ? `${song.title} (${song.key})` : song.title)].join(","));
      rows++;
    });
    if (!rows) lines.push([...pre, "", ""].join(","));
  }
  return lines.join("\n");
}
