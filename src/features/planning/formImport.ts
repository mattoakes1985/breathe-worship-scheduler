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

/** Every worksheet of an .xlsx, in workbook order, as grids of strings.
 *  Numbers in date-styled cells are not detectable without parsing styles, so
 *  callers convert serials for the columns they know are dates (see interpretForm). */
export function readXlsxSheets(bytes: Uint8Array): Grid[] {
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
  // sheets in workbook order
  const wb = files["xl/workbook.xml"] && strFromU8(files["xl/workbook.xml"]);
  const rels = files["xl/_rels/workbook.xml.rels"] && strFromU8(files["xl/_rels/workbook.xml.rels"]);
  const paths: string[] = [];
  for (const rid of [...(wb ?? "").matchAll(/<sheet\b[^>]*\br:id="([^"]+)"/g)].map((m) => m[1])) {
    const rel = rels?.match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*>`))?.[0];
    const target = rel?.match(/Target="([^"]+)"/)?.[1];
    if (target) paths.push("xl/" + target.replace(/^\/?xl\//, "").replace(/^\//, ""));
  }
  if (!paths.length) paths.push(...Object.keys(files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort());
  const grids = paths.filter((p) => files[p]).map((p) => parseSheet(strFromU8(files[p]), shared));
  if (!grids.length) throw new Error("No worksheet found in that file.");
  return grids;
}

/** First worksheet of an .xlsx as a grid of strings. */
export function readXlsx(bytes: Uint8Array): Grid {
  return readXlsxSheets(bytes)[0];
}

function parseSheet(xml: string, shared: string[]): Grid {
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
    if (r < MAX_ROWS) grid[r] = Array.from(cells, (x) => x ?? "");
  }
  return Array.from(grid, (x) => x ?? []).filter((r, i) => i === 0 || r.some((c) => c.trim() !== ""));
}

/** Read a form export (.xlsx or .csv) and interpret it, using the first
 *  worksheet that looks like form responses. */
export function readForm(file: { name: string; bytes?: Uint8Array; text?: string }, today = new Date(), opts: { nameCol?: number; sheet?: number } = {}): { form: InterpretedForm; sheet: number; sheets: number } {
  const grids = /\.csv$/i.test(file.name) ? [readCsv(file.text ?? "")] : readXlsxSheets(file.bytes ?? new Uint8Array());
  const order = opts.sheet !== undefined ? [opts.sheet] : grids.map((_, i) => i);
  let firstError: Error | null = null;
  for (const i of order) {
    try {
      return { form: interpretForm(grids[i], today, opts), sheet: i, sheets: grids.length };
    } catch (e) {
      firstError ??= e as Error;
    }
  }
  throw firstError ?? new Error("Couldn't read that file.");
}

/** RFC 4180-ish CSV (quoted fields, doubled quotes, CRLF). */
export function readCsv(text: string): Grid {
  if (text.length > MAX_FILE_BYTES) throw new Error("That file is too large (over 5 MB).");
  text = text.replace(/^\uFEFF/, "");
  // Excel in some regions saves CSV with ";" or tabs: use whichever the header line uses most
  const firstLine = text.slice(0, text.search(/\r?\n/) >>> 0 || text.length).replace(/"[^"]*"/g, "");
  const delim = [",", ";", "\t"].map((d) => ({ d, n: firstLine.split(d).length })).sort((a, b) => b.n - a.n)[0].d;
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
    else if (ch === delim) { row.push(field); field = ""; }
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
  if (/^(maybe|possibly|perhaps|if needed|if desperate|if you're stuck|if stuck|tbc|tbd|unsure|not sure|depends|probably)\b/.test(v)) return "maybe";
  if (/^(n|no|nope|unavailable|not available|can'?t|cannot|can not|unable|away|busy|not free|no thanks)\b/.test(v) || v === "✗" || v === "x") return "no";
  if (/^(y|yes|yep|yeah|ok|okay|sure|available|free|happy to|can do|i can)\b/.test(v) || /^[✓✔]/.test(v) || v === "true") return "yes";
  if (v === "false") return "no";
  return null;
}

/** "Sunday 2nd August" -> { day: 2, month: 8, year?: number } */
export function parseDateHeader(header: string): { day: number; month: number; year: number | null } | null {
  const h = clean(header).toLowerCase();
  // a header typed as a date cell comes through as an Excel serial number
  if (/^\d{5}(\.\d+)?$/.test(h) && +h > 40000 && +h < 60000) {
    const t = excelSerialToText(Number(h));
    return { day: +t.slice(8, 10), month: +t.slice(5, 7), year: +t.slice(0, 4) };
  }
  // 2026-08-02
  const iso = h.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso && +iso[2] >= 1 && +iso[2] <= 12 && +iso[3] >= 1 && +iso[3] <= 31) return { day: +iso[3], month: +iso[2], year: +iso[1] };
  // 02/08, 2/8/26, 02.08.2026 — UK order, day first
  const num = h.match(/(?:^|[^\d:])(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?(?![\d:])/);
  if (num && +num[1] >= 1 && +num[1] <= 31 && +num[2] >= 1 && +num[2] <= 12 && !/^\d{1,2}[.:]\d{2}\s*(am|pm)?$/.test(h)) {
    const y = num[3] ? (num[3].length === 2 ? 2000 + +num[3] : +num[3]) : null;
    return { day: +num[1], month: +num[2], year: y };
  }
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
  /** for a "tick the dates you can do" question: the option text for this date */
  option?: string;
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
  /** every header, so the name column can be chosen by hand */
  headers: string[];
  nameCol: number;
  /** true when no column was called "Name" and we picked the likeliest one */
  nameGuessed: boolean;
  requestCol: number | null;
  submittedCol: number | null;
  dates: DateColumn[];
  entries: FormEntry[];
  month: string; // YYYY-MM of the majority of dates
  problems: string[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const formatIso = (iso: string) => `${+iso.slice(8, 10)}/${+iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function toSubmitted(v: string): string | null {
  const t = clean(v);
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return excelSerialToText(Number(t));
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]} ${iso[4]}:${iso[5]}`;
  const dm = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i); // 06/07/2026 14:03 (UK) or 7/6/26 2:03 PM (US)
  if (dm) {
    const y = dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3]);
    let day = Number(dm[1]);
    let month = Number(dm[2]);
    if (month > 12 && day <= 12) [day, month] = [month, day]; // US order
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    let hr = Number(dm[4]);
    if (dm[6]) hr = (hr % 12) + (/pm/i.test(dm[6]) ? 12 : 0);
    return `${y}-${pad(month)}-${pad(day)} ${pad(hr)}:${dm[5]}`;
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

const NAME_HEADER = (h: string) => /^(your\s+)?(full\s+)?name\d*$/i.test(h) || /^name\b/i.test(h) || /\bwho are you\b|\byour name\b/i.test(h);
const DATE_TOKEN_SPLIT = /\s*;\s*/;

/** Find the header row: forms put it first, but people add title rows. */
function findHeaderRow(grid: Grid): number {
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(grid.length - 1, 6); i++) {
    const row = (grid[i] ?? []).map((c) => clean(c ?? ""));
    const score = row.filter((h) => parseDateHeader(h)).length * 2 + row.filter(NAME_HEADER).length * 3 + row.filter((h) => /request|completion time|start time/i.test(h)).length;
    if (score > bestScore) { best = i; bestScore = score; }
  }
  return best;
}

export function interpretForm(grid: Grid, today: Date = new Date(), opts: { nameCol?: number } = {}): InterpretedForm {
  const problems: string[] = [];
  const headerRow = findHeaderRow(grid);
  if (grid.length - headerRow < 2) throw new Error("The file has no responses in it.");
  const header = (grid[headerRow] ?? []).map((h) => clean(h ?? ""));
  const rows = grid.slice(headerRow + 1);
  const width = Math.max(header.length, ...rows.map((r) => r.length));
  while (header.length < width) header.push("");
  const filled = (c: number) => rows.filter((r) => clean(r[c] ?? "") !== "").length;

  const requestCol = header.findIndex((h) => /request|comment|anything else|notes?\b/i.test(h));
  const submittedCol = (() => {
    const c = header.findIndex((h) => /^completion time$/i.test(h));
    return c >= 0 ? c : header.findIndex((h) => /^(start time|timestamp|submitted)/i.test(h));
  })();

  // Name: chosen by hand, or a column called Name / Name1 / Your name... with the
  // most answers, or failing that the likeliest-looking column of short text.
  let nameGuessed = false;
  let nameCol: number | undefined = opts.nameCol !== undefined && opts.nameCol >= 0 && opts.nameCol < width ? opts.nameCol : undefined;
  if (nameCol === undefined) {
    nameCol = header.map((h, i) => ({ i, h })).filter(({ h }) => NAME_HEADER(h)).sort((a, b) => filled(b.i) - filled(a.i))[0]?.i;
    if (nameCol !== undefined && filled(nameCol) === 0) nameCol = undefined;
  }
  if (nameCol === undefined) {
    const looksLikeName = (c: number) => {
      if (c === requestCol || c === submittedCol || parseDateHeader(header[c]) || /^(id|email|start time|completion time|last modified)/i.test(header[c])) return 0;
      const vals = rows.map((r) => clean(r[c] ?? "")).filter(Boolean);
      if (vals.length < Math.max(1, rows.length / 2)) return 0;
      const ok = vals.filter((v) => v.length <= 40 && /[a-z]/i.test(v) && !/@/.test(v) && normaliseAnswer(v) === null && !/^\d/.test(v) && !v.includes(";"));
      return ok.length / vals.length > 0.8 ? ok.length : 0;
    };
    const scored = header.map((_, i) => ({ i, s: looksLikeName(i) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    if (scored.length) {
      nameCol = scored[0].i;
      nameGuessed = true;
      problems.push(`No column is called "Name", so names are taken from "${header[nameCol] || `column ${nameCol + 1}`}". Change it above if that's wrong.`);
    }
  }
  if (nameCol === undefined) throw new Error(`Couldn't find the column with people's names in it. The columns are: ${header.filter(Boolean).slice(0, 12).join(", ")}.`);

  const submittedTimes = rows.map((r) => (submittedCol >= 0 ? toSubmitted(r[submittedCol] ?? "") : null));
  const refTimes = submittedTimes.filter(Boolean).map((s) => Date.UTC(+s!.slice(0, 4), +s!.slice(5, 7) - 1, +s!.slice(8, 10))).filter((n) => Number.isFinite(n));
  const reference = refTimes.length ? new Date(Math.max(...refTimes)) : today;

  const dates: DateColumn[] = [];
  const perDate = new Map<string, number>();
  const addDate = (col: number, h: string, d: { day: number; month: number; year: number | null }, option?: string) => {
    const date = resolveYear(d.day, d.month, d.year, reference);
    const n = (perDate.get(date) ?? 0) + 1;
    perDate.set(date, n);
    const said = h.match(WEEKDAY_RE)?.[1]?.toLowerCase();
    const actual = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10))).getUTCDay()];
    if (said && !actual.toLowerCase().startsWith(said.slice(0, 3))) problems.push(`"${h}": ${formatIso(date)} is a ${actual} — check the date in the form.`);
    dates.push({ col, header: h, date, key: n === 1 ? date : `${date}#${n}`, allIn: /all[\s-]?in/i.test(h), ...describeColumn(h), ...(option ? { option } : {}) });
  };
  header.forEach((h, col) => {
    if (col === nameCol || col === requestCol || col === submittedCol) return;
    const d = parseDateHeader(h);
    if (d) return addDate(col, h, d);
    // "Which Sundays can you do?" with ticks: one column, options joined by ";"
    // (MS Forms always ends a multiple-choice answer with ";")
    if (/^(id|email|start time|completion time|last modified|name)/i.test(h)) return;
    if (!rows.some((r) => (r[col] ?? "").includes(";"))) return;
    const tokens = rows.flatMap((r) => clean(r[col] ?? "").split(DATE_TOKEN_SPLIT)).filter(Boolean);
    if (tokens.some((t) => /\d{1,2}:\d{2}/.test(t))) return;
    const dateTokens = [...new Set(tokens)].filter((t) => parseDateHeader(t));
    if (dateTokens.length && dateTokens.length >= new Set(tokens).size * 0.6) {
      dateTokens
        .map((t) => ({ t, d: parseDateHeader(t)! }))
        .sort((a, b) => a.d.month - b.d.month || a.d.day - b.d.day)
        .forEach(({ t, d: dd }) => addDate(col, t, dd, t));
    }
  });
  if (dates.length === 0) throw new Error(`Couldn't find any dates. Date columns should be headed like "Sunday 2nd August" or "02/08". The columns are: ${header.filter(Boolean).slice(0, 12).join(", ")}.`);

  const byKey = new Map<string, FormEntry & { _t: string }>();
  rows.forEach((r, i) => {
    const rawName = clean(r[nameCol] ?? "");
    if (!rawName) return;
    const answers: Record<string, Answer | null> = {};
    for (const d of dates) {
      const raw = r[d.col] ?? "";
      if (d.option !== undefined) {
        // ticked = yes; answered the question but didn't tick it = no
        const ticked = clean(raw).split(DATE_TOKEN_SPLIT).includes(d.option);
        answers[d.key] = ticked ? "yes" : clean(raw) ? "no" : null;
        continue;
      }
      const a = normaliseAnswer(raw);
      if (a === null && clean(raw)) problems.push(`${rawName}: didn't understand "${clean(raw).slice(0, 30)}" for ${d.header} (left blank, so treated as not available)`);
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
    headers: header,
    nameCol,
    nameGuessed,
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
