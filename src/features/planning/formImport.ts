// MS Forms availability import (WO-3). Pure functions, no Supabase.
// Reads the .xlsx (or .csv) that Microsoft Forms exports: one row per
// submission, a free-text name column, one Yes/No column per Sunday, an
// optional "(All-in)" marker in a column header, and a free-text requests column.
import { unzipSync, strFromU8 } from "fflate";

export type Answer = "yes" | "no" | "maybe";
export type Grid = string[][];

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 2000;
const MAX_COLS = 200;

// ---------------------------------------------------------------- readers

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

function colIndex(ref: string): number {
  const letters = ref.replace(/[^A-Z]/gi, "").toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Excel serial date (1900 system) -> "YYYY-MM-DD HH:MM" as written in the sheet. */
export function excelSerialToText(serial: number): string {
  const ms = Math.round((serial - 25569) * 86_400_000);
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** First worksheet of an .xlsx as a grid of strings. Numbers in date-styled
 *  cells are not detectable without parsing styles, so callers convert serials
 *  for the columns they know are dates (see interpretForm). */
export function readXlsx(bytes: Uint8Array): Grid {
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("That file is too large (over 5 MB).");
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) =>
        (f.name === "xl/workbook.xml" || f.name === "xl/sharedStrings.xml" || f.name === "xl/_rels/workbook.xml.rels" || /^xl\/worksheets\/sheet\d+\.xml$/.test(f.name)) &&
        f.originalSize < 20 * 1024 * 1024,
    });
  } catch {
    throw new Error("That doesn't look like an Excel (.xlsx) file.");
  }
  const shared: string[] = [];
  const ss = files["xl/sharedStrings.xml"];
  if (ss) {
    const xml = strFromU8(ss);
    for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
      const parts = si.match(/<t[^>]*>[\s\S]*?<\/t>/g) ?? [];
      shared.push(decodeXml(parts.map((t) => t.replace(/<t[^>]*>|<\/t>/g, "")).join("")));
    }
  }
  // first sheet in workbook order
  let sheetPath = "xl/worksheets/sheet1.xml";
  const wb = files["xl/workbook.xml"] && strFromU8(files["xl/workbook.xml"]);
  const rels = files["xl/_rels/workbook.xml.rels"] && strFromU8(files["xl/_rels/workbook.xml.rels"]);
  const firstRid = wb?.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  if (firstRid && rels) {
    const rel = rels.match(new RegExp(`<Relationship\\b[^>]*Id="${firstRid}"[^>]*>`))?.[0];
    const target = rel?.match(/Target="([^"]+)"/)?.[1];
    if (target) sheetPath = "xl/" + target.replace(/^\/?xl\//, "").replace(/^\//, "");
  }
  const sheet = files[sheetPath] ?? files["xl/worksheets/sheet1.xml"];
  if (!sheet) throw new Error("No worksheet found in that file.");
  const xml = strFromU8(sheet);
  const grid: Grid = [];
  for (const row of xml.match(/<row\b[\s\S]*?<\/row>/g) ?? []) {
    if (grid.length >= MAX_ROWS) break;
    const r = Number(row.match(/<row\b[^>]*\br="(\d+)"/)?.[1] ?? grid.length + 1) - 1;
    const cells: string[] = [];
    for (const c of row.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
      const attrs = c.match(/^<c\b([^>]*?)\/?>/)?.[1] ?? "";
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const idx = ref ? colIndex(ref) : cells.length;
      if (idx >= MAX_COLS) continue;
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      let value = "";
      if (type === "inlineStr") {
        value = decodeXml((c.match(/<t[^>]*>[\s\S]*?<\/t>/g) ?? []).map((t) => t.replace(/<t[^>]*>|<\/t>/g, "")).join(""));
      } else {
        const v = c.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
        value = type === "s" ? shared[Number(v)] ?? "" : decodeXml(v);
      }
      cells[idx] = value;
    }
    grid[r] = Array.from(cells, (x) => x ?? "");
  }
  return Array.from(grid, (x) => x ?? []).filter((r, i) => i === 0 || r.some((c) => c.trim() !== ""));
}

/** RFC 4180-ish CSV (quoted fields, doubled quotes, CRLF). */
export function readCsv(text: string): Grid {
  if (text.length > MAX_FILE_BYTES) throw new Error("That file is too large (over 5 MB).");
  const rows: Grid = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
      if (rows.length >= MAX_ROWS) break;
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r, i) => i === 0 || r.some((c) => c.trim() !== ""));
}

// ---------------------------------------------------------------- interpret

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export const clean = (s: string) => s.replace(/[ \s]+/g, " ").trim();
/** The same normalisation the database uses for alias_key. */
export const nameKey = (s: string) => clean(s).toLowerCase();

export function normaliseAnswer(raw: string): Answer | null {
  const v = clean(raw).toLowerCase();
  if (!v) return null;
  if (/^(y|yes|yep|available)\b/.test(v)) return "yes";
  if (/^(n|no|nope|unavailable|not available)\b/.test(v)) return "no";
  if (/^(maybe|possibly|perhaps|if needed|tbc|unsure)\b/.test(v)) return "maybe";
  return null;
}

/** "Sunday 2nd August" -> { day: 2, month: 8, year?: number } */
export function parseDateHeader(header: string): { day: number; month: number; year: number | null } | null {
  const h = clean(header).toLowerCase();
  const m = h.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b(?:\s+(\d{4}))?/);
  const m2 = m ? null : h.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4}))?/);
  const day = m ? Number(m[1]) : m2 ? Number(m2[2]) : NaN;
  const monName = m ? m[2] : m2 ? m2[1] : "";
  const year = m ? m[3] : m2 ? m2[3] : undefined;
  const month = MONTHS.findIndex((x) => x.startsWith(monName.slice(0, 3))) + 1;
  if (!day || day > 31 || month < 1) return null;
  return { day, month, year: year ? Number(year) : null };
}

export interface DateColumn {
  col: number;
  header: string;
  date: string; // YYYY-MM-DD
  /** answers key: the date, or "date#2" for a second event on the same day */
  key: string;
  allIn: boolean;
  /** what the header says beyond the date, e.g. "Carols by Candlelight" */
  title: string | null;
  /** "HH:MM" if the header gives a time */
  time: string | null;
}

const WEEKDAY_RE = /\b(sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday|sday)?\b\.?/i;

/** The extra things a date header says: an event name and a time.
 *  "Saturday 15th August - Baptisms 6pm" -> { title: "Baptisms", time: "18:00" } */
export function describeColumn(header: string): { title: string | null; time: string | null } {
  let h = clean(header);
  let time: string | null = null;
  const ampm = h.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/i);
  const h24 = ampm ? null : h.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if (ampm) {
    let hr = Number(ampm[1]) % 12;
    if (/pm/i.test(ampm[3])) hr += 12;
    time = `${pad(hr)}:${ampm[2] ?? "00"}`;
    h = h.replace(ampm[0], " ");
  } else if (h24) {
    time = `${pad(Number(h24[1]))}:${h24[2]}`;
    h = h.replace(h24[0], " ");
  }
  h = h
    .replace(/\(?\s*all[\s-]?in\s*\)?/i, " ")
    .replace(/\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b(?:\s+\d{4})?/i, " ")
    .replace(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?\b(?:,?\s+\d{4})?/i, " ")
    .replace(WEEKDAY_RE, " ")
    .replace(/\b(at|@)\b|[@()\[\]–—:-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s,.;&]+|[\s,.;&]+$/g, "");
  const title = /[a-z]{2}/i.test(h) ? h.charAt(0).toUpperCase() + h.slice(1) : null;
  return { title: title ? title.slice(0, 80) : null, time };
}

export interface FormEntry {
  rawName: string;
  key: string;
  submittedAt: string | null; // "YYYY-MM-DD HH:MM"
  answers: Record<string, Answer | null>; // column key (date, or "date#2") -> answer
  request: string;
  superseded: number; // earlier submissions from the same name that were dropped
}

export interface InterpretedForm {
  nameCol: number;
  requestCol: number | null;
  submittedCol: number | null;
  dates: DateColumn[];
  entries: FormEntry[];
  month: string; // YYYY-MM of the majority of dates
  problems: string[];
}

const pad = (n: number) => String(n).padStart(2, "0");

function toSubmitted(v: string): string | null {
  const t = clean(v);
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return excelSerialToText(Number(t));
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]} ${iso[4]}:${iso[5]}`;
  const uk = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})/); // 06/07/2026 14:03
  if (uk) {
    const y = uk[3].length === 2 ? 2000 + Number(uk[3]) : Number(uk[3]);
    return `${y}-${pad(Number(uk[2]))}-${pad(Number(uk[1]))} ${pad(Number(uk[4]))}:${uk[5]}`;
  }
  return null;
}

/** Pick the year that puts the date nearest the submission time (forms are sent a few weeks ahead). */
function resolveYear(day: number, month: number, explicit: number | null, reference: Date): string {
  if (explicit) return `${explicit}-${pad(month)}-${pad(day)}`;
  const y = reference.getFullYear();
  let best = "";
  let bestDiff = Infinity;
  for (const year of [y - 1, y, y + 1]) {
    const diff = Math.abs(Date.UTC(year, month - 1, day) - reference.getTime());
    if (diff < bestDiff) { bestDiff = diff; best = `${year}-${pad(month)}-${pad(day)}`; }
  }
  return best;
}

export function interpretForm(grid: Grid, today: Date = new Date()): InterpretedForm {
  const problems: string[] = [];
  if (grid.length < 2) throw new Error("The file has no responses in it.");
  const header = grid[0].map((h) => clean(h ?? ""));
  const rows = grid.slice(1);
  const filled = (c: number) => rows.filter((r) => clean(r[c] ?? "") !== "").length;

  // Name: a column called Name / Name1 / Your name... with the most answers.
  const nameCandidates = header
    .map((h, i) => ({ i, h }))
    .filter(({ h }) => /^(your\s+)?(full\s+)?name\d*$/i.test(h) || /^name\b/i.test(h));
  const nameCol = nameCandidates.sort((a, b) => filled(b.i) - filled(a.i))[0]?.i;
  if (nameCol === undefined || filled(nameCol) === 0) throw new Error("Couldn't find a Name column with answers in it.");

  const requestCol = header.findIndex((h) => /request|comment|anything else|notes?\b/i.test(h));
  const submittedCol = (() => {
    const c = header.findIndex((h) => /^completion time$/i.test(h));
    return c >= 0 ? c : header.findIndex((h) => /^(start time|timestamp|submitted)/i.test(h));
  })();

  const submittedTimes = rows.map((r) => (submittedCol >= 0 ? toSubmitted(r[submittedCol] ?? "") : null));
  const refTimes = submittedTimes.filter(Boolean).map((s) => Date.UTC(+s!.slice(0, 4), +s!.slice(5, 7) - 1, +s!.slice(8, 10)));
  const reference = refTimes.length ? new Date(Math.max(...refTimes)) : today;

  const dates: DateColumn[] = [];
  const perDate = new Map<string, number>();
  header.forEach((h, col) => {
    if (col === nameCol || col === requestCol || col === submittedCol) return;
    const d = parseDateHeader(h);
    if (!d) return;
    const date = resolveYear(d.day, d.month, d.year, reference);
    const n = (perDate.get(date) ?? 0) + 1;
    perDate.set(date, n);
    dates.push({ col, header: h, date, key: n === 1 ? date : `${date}#${n}`, allIn: /all[\s-]?in/i.test(h), ...describeColumn(h) });
  });
  if (dates.length === 0) throw new Error("Couldn't find any date columns (like \"Sunday 2nd August\").");

  const byKey = new Map<string, FormEntry & { _t: string }>();
  rows.forEach((r, i) => {
    const rawName = clean(r[nameCol] ?? "");
    if (!rawName) return;
    const answers: Record<string, Answer | null> = {};
    for (const d of dates) {
      const raw = r[d.col] ?? "";
      const a = normaliseAnswer(raw);
      if (a === null && clean(raw)) problems.push(`${rawName}: didn't understand "${clean(raw).slice(0, 30)}" for ${d.header}`);
      answers[d.key] = a;
    }
    const entry = {
      rawName: rawName.slice(0, 120),
      key: nameKey(rawName),
      submittedAt: submittedTimes[i],
      answers,
      request: requestCol >= 0 ? clean(r[requestCol] ?? "").slice(0, 1000) : "",
      superseded: 0,
      _t: submittedTimes[i] ?? `0000-${pad(i)}`,
    };
    const prev = byKey.get(entry.key);
    if (!prev) byKey.set(entry.key, entry);
    else if (entry._t >= prev._t) byKey.set(entry.key, { ...entry, superseded: prev.superseded + 1 });
    else prev.superseded += 1;
  });

  const monthCounts = new Map<string, number>();
  for (const d of dates) monthCounts.set(d.date.slice(0, 7), (monthCounts.get(d.date.slice(0, 7)) ?? 0) + 1);
  const month = [...monthCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

  return {
    nameCol,
    requestCol: requestCol >= 0 ? requestCol : null,
    submittedCol: submittedCol >= 0 ? submittedCol : null,
    dates,
    entries: [...byKey.values()].map(({ _t: _ignored, ...e }) => e).sort((a, b) => a.rawName.localeCompare(b.rawName, undefined, { numeric: true, sensitivity: "base" })),
    month,
    problems,
  };
}

// ---------------------------------------------------------------- matching

export interface MatchPerson {
  id: string;
  name: string;
}

export interface NameMatch {
  personId: string | null;
  how: "alias" | "name" | "none";
  suggestions: MatchPerson[];
}

/** Exact remembered alias first, then exact display name, else suggestions
 *  (same first name / same initial+surname). Suggestions are never applied
 *  automatically — a person confirms them once and the alias is remembered. */
export function matchName(raw: string, aliases: Map<string, string>, people: MatchPerson[]): NameMatch {
  const key = nameKey(raw);
  const viaAlias = aliases.get(key);
  if (viaAlias) return { personId: viaAlias, how: "alias", suggestions: [] };
  const exact = people.find((p) => nameKey(p.name) === key);
  if (exact) return { personId: exact.id, how: "name", suggestions: [] };
  const [first, ...rest] = key.split(" ");
  const last = rest.slice(-1)[0] ?? "";
  const scored = people
    .map((p) => {
      const [pf, ...pr] = nameKey(p.name).split(" ");
      const pl = pr.slice(-1)[0] ?? "";
      let s = 0;
      if (pf === first) s += 3;
      else if (pf.startsWith(first) || first.startsWith(pf)) s += 2;
      if (last && pl && (pl === last || pl.startsWith(last) || last.startsWith(pl))) s += 2;
      return { p, s };
    })
    .filter((x) => x.s >= 2)
    .sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name))
    .slice(0, 4)
    .map((x) => x.p);
  return { personId: null, how: "none", suggestions: scored };
}

// ---------------------------------------------------------------- services from the form

export interface ExistingService {
  id: string;
  service_date: string;
  start_time: string | null; // "HH:MM:SS"
  title: string;
}

export interface ColumnService {
  key: string;
  date: string;
  /** an existing service this column's answers go to */
  serviceId: string | null;
  /** or a service to create */
  create: { title: string; time: string; timeGuessed: boolean; allIn: boolean } | null;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekdayOf = (iso: string) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))).getUTCDay();
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

/**
 * The form decides the month's services: each date column is matched to an
 * existing service on that date (same time if the header gives one, otherwise
 * in time order); anything left over is created. Services in the month that no
 * column matched are returned as `extras`.
 */
export function matchColumnsToServices(
  dates: DateColumn[],
  services: ExistingService[],
  defaults: { sundayTitle: string; sundayTime: string }
): { columns: ColumnService[]; extras: ExistingService[] } {
  const used = new Set<string>();
  const onDate = (d: string) => services.filter((s) => s.service_date === d).sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
  const pick = new Map<string, string>();
  // timed columns first, so an untimed column doesn't take their service
  for (const c of dates.filter((c) => c.time)) {
    const hit = onDate(c.date).find((s) => !used.has(s.id) && hhmm(s.start_time) === c.time);
    if (hit) { used.add(hit.id); pick.set(c.key, hit.id); }
  }
  for (const c of dates.filter((c) => !c.time)) {
    const hit = onDate(c.date).find((s) => !used.has(s.id));
    if (hit) { used.add(hit.id); pick.set(c.key, hit.id); }
  }
  const columns = dates.map((c): ColumnService => {
    const id = pick.get(c.key);
    if (id) return { key: c.key, date: c.date, serviceId: id, create: null };
    const sunday = weekdayOf(c.date) === 0;
    const time = c.time ?? defaults.sundayTime.slice(0, 5);
    const title = c.title ?? (sunday ? (time === defaults.sundayTime.slice(0, 5) ? defaults.sundayTitle : `Sunday ${time} Service`) : `${WEEKDAYS[weekdayOf(c.date)]} service`);
    return { key: c.key, date: c.date, serviceId: null, create: { title, time, timeGuessed: !c.time && !sunday, allIn: c.allIn } };
  });
  const from = dates.length ? dates.map((d) => d.date).sort()[0].slice(0, 7) : "";
  const extras = services.filter((s) => !used.has(s.id) && s.service_date.startsWith(from) && dates.every((d) => d.date.slice(0, 7) === from));
  return { columns, extras };
}
