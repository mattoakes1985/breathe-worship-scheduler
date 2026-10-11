// WO-4 month grid: the master sheet's layout (one column per Sunday) built
// from app data, plus copy-as-text and .xlsx export in the same layout.
// Pure functions — no Supabase, no DOM.
import { strToU8, zipSync } from "fflate";

export interface GridRowDef {
  label: string;
  role_id?: string | null;
  slot?: number;
  /** a free-text service field instead of a role */
  field?: "events_note";
}

export interface GridService {
  id: string;
  date: string; // YYYY-MM-DD
  start_time: string | null; // HH:MM[:SS]
  title: string;
  theme: string | null;
  other_items: string | null;
  preacher: string | null;
  events_note: string | null;
  linked_service_id: string | null;
  is_all_in: boolean;
}

export interface GridSong {
  service_id: string;
  order_index: number;
  title: string;
  key: string | null;
  bpm: number | null;
  time_signature: string | null;
  click_signature: string | null;
}

export interface GridFlow {
  id: string;
  service_id: string;
  order_index: number;
  title: string;
  after_song: number | null;
}

export interface GridSlot {
  service_id: string;
  role_id: string;
  slot_index: number;
  name: string;
}

export interface GridInput {
  month: string; // YYYY-MM
  services: GridService[];
  rows: GridRowDef[];
  slots: GridSlot[];
  songs: GridSong[];
  flow: GridFlow[];
  /** people who said yes, per service */
  available: { service_id: string; name: string }[];
}

export interface GridColumn {
  key: string;
  serviceIds: string[];
  primaryId: string;
  date: string;
  header: string; // "Sunday 2nd August 11.15" / "Sunday 6th September DOUBLE 9.15 & 11.15"
}

export type RunLine = { kind: "song"; text: string; n: number } | { kind: "flow"; text: string; id: string };

export interface GridRow {
  label: string;
  kind: "theme" | "date" | "text" | "person" | "events";
  cells: string[];
  roleId?: string;
  slot?: number;
}

export interface MonthGrid {
  title: string; // "NOVEMBER 2026"
  columns: GridColumn[];
  rows: GridRow[];
  songs: RunLine[][]; // per column
  availability: string[][]; // per column
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

/** "11:15:00" -> "11.15", "09:15" -> "9.15" (the sheet's style) */
export function sheetTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  return `${Number(h)}.${m}`;
}

export function dateHeader(date: string, times: string[]): string {
  const d = new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
  const base = `${DAYS[d.getDay()]} ${ordinal(d.getDate())} ${MONTHS[d.getMonth()]}`;
  const t = times.filter(Boolean).map(sheetTime);
  if (t.length > 1) return `${base} DOUBLE ${t.join(" & ")}`;
  return t.length ? `${base} ${t[0]}` : base;
}

/** "1. Echoes - G 142bpm 4/4" (click shown when it differs from the meter) */
export function songLine(n: number, s: Pick<GridSong, "title" | "key" | "bpm" | "time_signature" | "click_signature">): string {
  const bits = [s.key?.trim(), s.bpm ? `${s.bpm}bpm` : "", s.time_signature?.trim()].filter(Boolean).join(" ");
  const click = s.click_signature && s.click_signature !== s.time_signature ? ` (${s.click_signature} click)` : "";
  return `${n}. ${s.title.trim()}${bits ? ` - ${bits}` : ""}${click}`;
}

/** Songs in order with running-order lines placed between them. */
export function runSheet(songs: GridSong[], flow: GridFlow[]): RunLine[] {
  const ordered = [...songs].sort((a, b) => a.order_index - b.order_index);
  const n = ordered.length;
  const pos = (f: GridFlow) => (f.after_song == null ? n : Math.min(Math.max(f.after_song, 0), n));
  const out: RunLine[] = [];
  for (let k = 0; k <= n; k++) {
    for (const f of flow.filter((x) => pos(x) === k).sort((a, b) => a.order_index - b.order_index)) out.push({ kind: "flow", text: f.title, id: f.id });
    if (k < n) out.push({ kind: "song", text: songLine(k + 1, ordered[k]), n: k + 1 });
  }
  return out;
}

export const DEFAULT_ROWS_NOTE = "Events sits before PA unless the layout says otherwise.";

export function buildMonthGrid(input: GridInput): MonthGrid {
  const [y, m] = input.month.split("-").map(Number);
  const services = [...input.services].sort((a, b) => a.date.localeCompare(b.date) || (a.start_time ?? "").localeCompare(b.start_time ?? ""));

  // One column per service, except linked services on the same day (a double
  // Sunday with one band), which share a column.
  const columns: GridColumn[] = [];
  const used = new Set<string>();
  for (const s of services) {
    if (used.has(s.id)) continue;
    const partners = services.filter(
      (o) => o.id !== s.id && !used.has(o.id) && o.date === s.date && (o.linked_service_id === s.id || s.linked_service_id === o.id)
    );
    const group = [s, ...partners];
    group.forEach((g) => used.add(g.id));
    columns.push({
      key: group.map((g) => g.id).join("+"),
      serviceIds: group.map((g) => g.id),
      primaryId: s.id,
      date: s.date,
      header: dateHeader(s.date, group.map((g) => g.start_time ?? "")),
    });
  }
  const svc = new Map(services.map((s) => [s.id, s]));
  const primary = (c: GridColumn) => svc.get(c.primaryId)!;
  const field = (c: GridColumn, f: "theme" | "other_items" | "preacher" | "events_note") =>
    [...new Set(c.serviceIds.map((id) => (svc.get(id)?.[f] ?? "").trim()).filter(Boolean))].join(" / ");

  const rowDefs = [...input.rows];
  if (!rowDefs.some((r) => r.field === "events_note")) {
    const pa = rowDefs.findIndex((r) => /^pa$/i.test(r.label));
    rowDefs.splice(pa >= 0 ? pa : rowDefs.length, 0, { label: "Events", field: "events_note" });
  }

  const rows: GridRow[] = [
    { label: "Theme", kind: "theme", cells: columns.map((c) => field(c, "theme")) },
    { label: "Date", kind: "date", cells: columns.map((c) => c.header) },
    {
      label: "Other Items",
      kind: "text",
      cells: columns.map((c) => [field(c, "other_items"), primary(c).is_all_in && !/all[\s-]?in/i.test(field(c, "other_items")) ? "All-in" : ""].filter(Boolean).join(" · ")),
    },
    { label: "Preach", kind: "text", cells: columns.map((c) => field(c, "preacher")) },
  ];
  for (const def of rowDefs) {
    if (def.field === "events_note") {
      rows.push({ label: def.label || "Events", kind: "events", cells: columns.map((c) => field(c, "events_note")) });
      continue;
    }
    const slot = def.slot ?? 0;
    rows.push({
      label: def.label,
      kind: "person",
      roleId: def.role_id ?? undefined,
      slot,
      cells: columns.map((c) => input.slots.find((x) => x.service_id === c.primaryId && x.role_id === def.role_id && x.slot_index === slot)?.name ?? ""),
    });
  }

  const songs = columns.map((c) => runSheet(input.songs.filter((s) => s.service_id === c.primaryId), input.flow.filter((f) => f.service_id === c.primaryId)));
  const availability = columns.map((c) => {
    const names = new Set(input.available.filter((a) => c.serviceIds.includes(a.service_id)).map((a) => a.name));
    return [...names].sort((a, b) => a.localeCompare(b));
  });

  return { title: `${MONTHS[m - 1].toUpperCase()} ${y}`, columns, rows, songs, availability };
}

/** Plain text for one column, ready to paste into WhatsApp/email. */
export function columnText(grid: MonthGrid, i: number): string {
  const lines: string[] = [grid.columns[i].header];
  for (const r of grid.rows) {
    if (r.kind === "date") continue;
    const v = r.cells[i];
    if (v) lines.push(`${r.label}: ${v}`);
  }
  if (grid.songs[i].length) {
    lines.push("", "Songs");
    for (const l of grid.songs[i]) lines.push(l.kind === "song" ? l.text : `  ${l.text}`);
  }
  return lines.join("\n");
}

export function monthText(grid: MonthGrid): string {
  return [grid.title, ...grid.columns.map((_, i) => columnText(grid, i))].join("\n\n");
}

// ---------------------------------------------------------------- xlsx

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    // XML 1.0 forbids most control characters
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// Style ids (see styles.xml below): 0 plain · 1 grey label · 2 grey bold (date)
// 3 orange bold label (Events) · 4 yellow bold label (PA) · 5 yellow cell · 6 bold
type Cell = { v: string; s?: number };

/** The month in the master sheet's layout as an .xlsx file. */
export function monthXlsx(grid: MonthGrid): Uint8Array {
  const n = grid.columns.length;
  const sheet: Cell[][] = [];
  for (const r of grid.rows) {
    const isPA = /^pa$/i.test(r.label);
    const labelStyle = r.kind === "events" ? 3 : isPA ? 4 : r.kind === "date" ? 2 : 1;
    const cellStyle = r.kind === "date" ? 2 : r.kind === "theme" || r.kind === "text" ? 1 : isPA ? 5 : 0;
    sheet.push([{ v: r.label, s: labelStyle }, ...r.cells.map((v) => ({ v, s: cellStyle }))]);
  }
  sheet.push([{ v: "Songs", s: 2 }, ...grid.columns.map(() => ({ v: "" }))]);
  const songRows = Math.max(0, ...grid.songs.map((s) => s.length));
  for (let k = 0; k < songRows; k++) {
    sheet.push([{ v: "" }, ...grid.songs.map((col) => {
      const l = col[k];
      if (!l) return { v: "" };
      return { v: l.text, s: l.kind === "flow" && /^preach/i.test(l.text) ? 6 : 0 };
    })]);
  }
  const availRows = Math.max(1, ...grid.availability.map((a) => a.length));
  for (let k = 0; k < availRows; k++) {
    sheet.push([{ v: k === 0 ? "Availability" : "", s: k === 0 ? 1 : 0 }, ...grid.availability.map((a) => ({ v: a[k] ?? "" }))]);
  }

  const widths = [10, ...grid.columns.map((_, i) => Math.min(60, Math.max(24, ...grid.songs[i].map((l) => l.text.length + 2), grid.columns[i].header.length + 2)))];
  const sheetXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane xSplit="1" topLeftCell="B1" activePane="topRight" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` +
    `<sheetData>` +
    sheet
      .map((row, ri) =>
        `<row r="${ri + 1}">` +
        row
          .slice(0, n + 1)
          .map((c, ci) => (c.v || c.s ? `<c r="${colName(ci)}${ri + 1}"${c.s ? ` s="${c.s}"` : ""}${c.v ? ` t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>` : "/>"}` : ""))
          .join("") +
        `</row>`
      )
      .join("") +
    `</sheetData>` +
    `<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>` +
    `</worksheet>`;

  const fill = (rgb: string) => `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
  const styles =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fill("FFD9D9D9")}${fill("FFF4B084")}${fill("FFFFD966")}</fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="7">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
    `<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
    `<xf numFmtId="0" fontId="1" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
    `<xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1"/>` +
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  const sheetName = esc(grid.title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
  return zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
    ),
    "xl/styles.xml": strToU8(styles),
    "xl/worksheets/sheet1.xml": strToU8(sheetXml),
  });
}
