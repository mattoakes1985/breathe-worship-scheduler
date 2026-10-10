// Songs vault (WO-1) — pure logic: key parsing, filter/sort, duplicate
// detection, CSV/JSON export and dry-run import diff. No React, no Supabase:
// everything here is unit-tested in songModel.test.ts.
import type { Tables } from "@/lib/supabase/database.types";

export type Song = Tables<"songs">;
export interface SongStats {
  times_sung: number;
  last_sung: string | null;
  next_planned: string | null;
  played_keys: string[];
}
export type SongWithStats = Song & { stats: SongStats; openReviews: number };

// ---------------------------------------------------------------------------
// Keys. Stored values are free text from the old spreadsheet ("F or Eb",
// "C (B poss)", "G / C(DA)", "D (A- Dave)"). We extract real key tokens:
// a capital A–G, optional #/b, optional m, not glued to other letters — so
// "DA" (someone's initials) and "Dave" are ignored.
// ---------------------------------------------------------------------------
const ENHARMONIC: Record<string, string> = {
  "C#": "Db", "D#": "Eb", "Gb": "F#", "G#": "Ab", "A#": "Bb", "Cb": "B", "Fb": "E", "E#": "F", "B#": "C",
};
export const KEY_ORDER = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

export function normaliseKey(k: string): string {
  const m = /^([A-G])([#b]?)(m?)$/.exec(k.trim());
  if (!m) return k.trim();
  const root = m[1] + m[2];
  return (ENHARMONIC[root] ?? root) + m[3];
}

export function parseKeys(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  // No regex lookbehind: it is a syntax error on iOS Safari < 16.4 and would
  // take the whole bundle down. The leading group consumes the boundary char.
  const re = /(^|[^A-Za-z#])([A-G])([#b]?)(m?)(?![A-Za-z#])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const k = normaliseKey(m[2] + m[3] + m[4]);
    if (!out.includes(k)) out.push(k);
    // let the boundary char be reused by the next match ("F/G" → F, G)
    re.lastIndex = m.index + m[1].length + 1;
  }
  return out;
}

export type KeyField = "any" | "female" | "male" | "played";

export function songKeys(s: SongWithStats, field: KeyField): string[] {
  const female = parseKeys(s.default_key);
  const male = parseKeys(s.male_key);
  const played = [...s.legacy_played_keys, ...s.stats.played_keys].flatMap((k) => parseKeys(k));
  const pick = field === "female" ? female : field === "male" ? male : field === "played" ? played : [...female, ...male, ...played];
  return Array.from(new Set(pick));
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------
export type Tempo = "slow" | "mid" | "fast";
export const TEMPO_LABEL: Record<Tempo, string> = { slow: "Slow (under 80)", mid: "Mid (80–110)", fast: "Fast (over 110)" };
export function tempoOf(bpm: number | null): Tempo | null {
  if (bpm == null) return null;
  return bpm < 80 ? "slow" : bpm <= 110 ? "mid" : "fast";
}

export type Rotation = "in" | "rare" | "never";
export const ROTATION_LABEL: Record<Rotation, string> = {
  in: "In rotation (sung in last 6 months)",
  rare: "Rarely used",
  never: "Never sung in the app's history",
};

export type Missing = "bpm" | "female_key" | "male_key" | "artist" | "time_signature";
export const MISSING_LABEL: Record<Missing, string> = {
  bpm: "No BPM",
  female_key: "No female key",
  male_key: "No male key",
  artist: "No artist",
  time_signature: "No time signature",
};

export interface SongFilters {
  q?: string;
  keys?: string[];
  keyField?: KeyField;
  tempos?: Tempo[];
  bpmMin?: number;
  bpmMax?: number;
  timeSigs?: string[];
  artists?: string[]; // substring match ("Hillsong" matches Hillsong UNITED / Worship)
  tags?: string[];
  tagMode?: "any" | "all";
  notSungMonths?: number; // last sung more than N months ago (or never)
  sungWithinMonths?: number;
  minTimesSung?: number;
  rotation?: Rotation;
  missing?: Missing[];
  status?: "active" | "archived" | "all";
  needsChecking?: boolean;
  swung?: boolean;
}

export type SortKey = "title" | "artist" | "bpm" | "female_key" | "male_key" | "last_sung" | "times_sung" | "updated";
export interface SortSpec {
  key: SortKey;
  dir: "asc" | "desc";
}
export const SORT_LABEL: Record<SortKey, string> = {
  title: "Title",
  artist: "Artist",
  bpm: "BPM",
  female_key: "Female key",
  male_key: "Male key",
  last_sung: "Last sung",
  times_sung: "Times sung",
  updated: "Recently edited",
};

export function monthsAgo(n: number, today: Date): string {
  const d = new Date(today);
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

export function isRarelyUsed(s: SongWithStats, today: Date): boolean {
  if ((s.tags ?? []).some((t) => t.toLowerCase() === "rarely used")) return true;
  return !s.stats.last_sung || s.stats.last_sung < monthsAgo(12, today);
}

const lc = (x: string | null | undefined) => (x ?? "").toLowerCase();

export function matchesFilters(s: SongWithStats, f: SongFilters, today = new Date()): boolean {
  const status = f.status ?? "active";
  if (status === "active" && !s.is_active) return false;
  if (status === "archived" && s.is_active) return false;
  if (s.merged_into_id && status !== "all") return false;

  if (f.q) {
    const q = f.q.trim().toLowerCase();
    if (q && !(lc(s.title).includes(q) || lc(s.artist).includes(q) || (s.tags ?? []).some((t) => lc(t).includes(q)) || lc(s.ccli_number) === q))
      return false;
  }
  if (f.keys?.length) {
    const want = f.keys.map(normaliseKey);
    const have = songKeys(s, f.keyField ?? "any");
    if (!want.some((k) => have.includes(k))) return false;
  }
  if (f.tempos?.length) {
    const t = tempoOf(s.tempo_bpm);
    if (!t || !f.tempos.includes(t)) return false;
  }
  if (f.bpmMin != null && (s.tempo_bpm == null || s.tempo_bpm < f.bpmMin)) return false;
  if (f.bpmMax != null && (s.tempo_bpm == null || s.tempo_bpm > f.bpmMax)) return false;
  if (f.timeSigs?.length && !f.timeSigs.includes(s.time_signature ?? "")) return false;
  if (f.artists?.length && !f.artists.some((a) => lc(s.artist).includes(a.toLowerCase()))) return false;
  if (f.tags?.length) {
    const have = (s.tags ?? []).map((t) => t.toLowerCase());
    const want = f.tags.map((t) => t.toLowerCase());
    const ok = f.tagMode === "all" ? want.every((t) => have.includes(t)) : want.some((t) => have.includes(t));
    if (!ok) return false;
  }
  if (f.notSungMonths != null) {
    const cutoff = monthsAgo(f.notSungMonths, today);
    if (s.stats.last_sung && s.stats.last_sung >= cutoff) return false;
  }
  if (f.sungWithinMonths != null) {
    const cutoff = monthsAgo(f.sungWithinMonths, today);
    if (!s.stats.last_sung || s.stats.last_sung < cutoff) return false;
  }
  if (f.minTimesSung != null && s.stats.times_sung < f.minTimesSung) return false;
  if (f.rotation === "in" && !(s.stats.last_sung && s.stats.last_sung >= monthsAgo(6, today))) return false;
  if (f.rotation === "rare" && !isRarelyUsed(s, today)) return false;
  if (f.rotation === "never" && s.stats.times_sung > 0) return false;
  if (f.missing?.length) {
    const blank: Record<Missing, boolean> = {
      bpm: s.tempo_bpm == null,
      female_key: !s.default_key,
      male_key: !s.male_key,
      artist: !s.artist,
      time_signature: !s.time_signature,
    };
    if (!f.missing.some((m) => blank[m])) return false;
  }
  if (f.needsChecking && s.openReviews === 0) return false;
  if (f.swung != null && s.is_swung !== f.swung) return false;
  return true;
}

function keyRank(raw: string | null): number {
  const k = parseKeys(raw)[0];
  if (!k) return 999;
  const i = KEY_ORDER.indexOf(k.replace(/m$/, ""));
  return (i < 0 ? 900 : i) + (k.endsWith("m") ? 0.5 : 0);
}

export function sortSongs(list: SongWithStats[], sort: SortSpec): SongWithStats[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  const val = (s: SongWithStats): string | number | null => {
    switch (sort.key) {
      case "title": return lc(s.title);
      case "artist": return s.artist ? lc(s.artist) : null;
      case "bpm": return s.tempo_bpm;
      case "female_key": return s.default_key ? keyRank(s.default_key) : null;
      case "male_key": return s.male_key ? keyRank(s.male_key) : null;
      case "last_sung": return s.stats.last_sung;
      case "times_sung": return s.stats.times_sung;
      case "updated": return s.updated_at;
    }
  };
  return [...list].sort((a, b) => {
    const va = val(a), vb = val(b);
    // blanks always last, whichever direction
    if (va == null && vb == null) return lc(a.title).localeCompare(lc(b.title));
    if (va == null) return 1;
    if (vb == null) return -1;
    const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
    return c !== 0 ? c * dir : lc(a.title).localeCompare(lc(b.title));
  });
}

export function activeFilterCount(f: SongFilters): number {
  let n = 0;
  if (f.keys?.length) n++;
  if (f.tempos?.length) n++;
  if (f.bpmMin != null || f.bpmMax != null) n++;
  if (f.timeSigs?.length) n++;
  if (f.artists?.length) n++;
  if (f.tags?.length) n++;
  if (f.notSungMonths != null || f.sungWithinMonths != null) n++;
  if (f.minTimesSung != null) n++;
  if (f.rotation) n++;
  if (f.missing?.length) n++;
  if (f.status && f.status !== "active") n++;
  if (f.needsChecking) n++;
  if (f.swung != null) n++;
  return n;
}

/** Plain-English summary of a filter set, e.g. for a saved view's subtitle. */
export function describeFilters(f: SongFilters): string {
  const parts: string[] = [];
  if (f.tempos?.length) parts.push(f.tempos.map((t) => t).join("/"));
  if (f.keys?.length) parts.push(`in ${f.keys.join("/")}${f.keyField && f.keyField !== "any" ? ` (${f.keyField})` : ""}`);
  if (f.artists?.length) parts.push(`by ${f.artists.join(" or ")}`);
  if (f.tags?.length) parts.push(`tagged ${f.tags.join(f.tagMode === "all" ? " + " : " or ")}`);
  if (f.timeSigs?.length) parts.push(f.timeSigs.join("/"));
  if (f.bpmMin != null || f.bpmMax != null) parts.push(`${f.bpmMin ?? "…"}–${f.bpmMax ?? "…"} bpm`);
  if (f.notSungMonths != null) parts.push(`not sung in ${f.notSungMonths}+ months`);
  if (f.sungWithinMonths != null) parts.push(`sung in last ${f.sungWithinMonths} months`);
  if (f.minTimesSung != null) parts.push(`sung ${f.minTimesSung}+ times`);
  if (f.rotation) parts.push(ROTATION_LABEL[f.rotation].toLowerCase());
  if (f.missing?.length) parts.push(f.missing.map((m) => MISSING_LABEL[m].toLowerCase()).join(" or "));
  if (f.swung) parts.push("swung");
  if (f.needsChecking) parts.push("needs checking");
  if (f.status === "archived") parts.push("archived");
  if (f.q) parts.push(`“${f.q}”`);
  return parts.length ? parts.join(", ") : "All active songs";
}

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------
export function normTitle(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}
export function baseTitle(t: string): string {
  return normTitle(t.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " "));
}
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

export interface DuplicatePair {
  a: Song;
  b: Song;
  strength: "same title" | "similar title";
  reason: string;
}

export function pairKey(x: string, y: string): string {
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

export function findDuplicates(songs: Song[], dismissed: Set<string>): DuplicatePair[] {
  const live = songs.filter((s) => !s.merged_into_id);
  const out: DuplicatePair[] = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if (dismissed.has(pairKey(a.id, b.id))) continue;
      const na = normTitle(a.title), nb = normTitle(b.title);
      if (na === nb) {
        out.push({ a, b, strength: "same title", reason: "Titles match once spacing, punctuation and capitals are ignored" });
        continue;
      }
      const ba = baseTitle(a.title), bb = baseTitle(b.title);
      if (ba && ba === bb) {
        out.push({ a, b, strength: "similar title", reason: "Same title apart from the bit in brackets" });
        continue;
      }
      if (na.length >= 8 && nb.length >= 8 && levenshtein(na, nb) <= 2) {
        out.push({ a, b, strength: "similar title", reason: "Titles differ by one or two letters" });
      }
    }
  }
  return out.sort((x, y) => (x.strength === y.strength ? x.a.title.localeCompare(y.a.title) : x.strength === "same title" ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Export / import (the round trip must be lossless: export → dry-run import
// of the same file = zero differences).
// ---------------------------------------------------------------------------
export const EDITABLE_FIELDS = [
  "title", "artist", "default_key", "male_key", "tempo_bpm", "bpm_feel", "time_signature", "click_signature",
  "is_swung", "tags", "ccli_number", "chord_chart_url", "audio_url", "notes", "is_active",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];
export const FIELD_LABEL: Record<EditableField, string> = {
  title: "Title", artist: "Artist", default_key: "Female key", male_key: "Male key", tempo_bpm: "BPM",
  bpm_feel: "Feel", time_signature: "Time signature", click_signature: "Click", is_swung: "Swung", tags: "Tags",
  ccli_number: "CCLI", chord_chart_url: "Chord chart", audio_url: "Audio link", notes: "Notes", is_active: "Active",
};
const CSV_HEADER = ["id", ...EDITABLE_FIELDS, "version", "times_sung", "last_sung"] as const;

export type EditableValues = { [K in EditableField]: string | number | boolean | string[] | null };

export function editableOf(s: Song): EditableValues {
  const o = {} as EditableValues;
  for (const f of EDITABLE_FIELDS) o[f] = (s as unknown as Record<string, EditableValues[EditableField]>)[f] ?? null;
  return o;
}

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = Array.isArray(v) ? v.join("; ") : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function songsToCsv(rows: SongWithStats[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const s of rows) {
    const rec: Record<string, unknown> = { ...editableOf(s), id: s.id, version: s.version, times_sung: s.stats.times_sung, last_sung: s.stats.last_sung };
    lines.push(CSV_HEADER.map((h) => csvCell(rec[h])).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

export function songsToJson(rows: SongWithStats[]): string {
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      format: "breathe-songs/1",
      songs: rows.map((s) => ({ id: s.id, ...editableOf(s), version: s.version, legacy_played_keys: s.legacy_played_keys, stats: s.stats })),
    },
    null,
    2
  );
}

/** RFC 4180-ish CSV parser (quotes, doubled quotes, CRLF, newlines in cells). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQ = false;
  const t = text.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) {
      if (c === '"') {
        if (t[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
      } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

export interface ImportRow {
  id?: string;
  values: Partial<EditableValues>;
}

function coerce(field: EditableField, raw: unknown): EditableValues[EditableField] {
  if (raw === undefined) return null;
  if (field === "tags") {
    const arr = Array.isArray(raw) ? raw.map(String) : String(raw ?? "").split(";");
    const clean = arr.map((x) => x.trim()).filter(Boolean);
    return clean.length ? clean : null;
  }
  if (field === "is_swung" || field === "is_active") {
    if (typeof raw === "boolean") return raw;
    const s = String(raw ?? "").trim().toLowerCase();
    if (s === "") return field === "is_active";
    return ["true", "yes", "y", "1"].includes(s);
  }
  if (field === "tempo_bpm") {
    if (raw === null || String(raw).trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  const s = raw === null ? "" : String(raw).trim();
  return s === "" ? null : s;
}

export function parseImport(text: string, filename: string): { rows: ImportRow[]; error?: string } {
  try {
    if (filename.toLowerCase().endsWith(".json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
      const data = JSON.parse(text);
      const list: Record<string, unknown>[] = Array.isArray(data) ? data : data.songs;
      if (!Array.isArray(list)) return { rows: [], error: "JSON file has no songs list" };
      return {
        rows: list.map((r) => {
          const values: Partial<EditableValues> = {};
          for (const f of EDITABLE_FIELDS) if (f in r) values[f] = coerce(f, r[f]);
          return { id: typeof r.id === "string" && r.id ? r.id : undefined, values };
        }),
      };
    }
    const grid = parseCsv(text);
    if (grid.length === 0) return { rows: [], error: "The file is empty" };
    const header = grid[0].map((h) => h.trim().toLowerCase());
    if (!header.includes("title")) return { rows: [], error: "The CSV needs a 'title' column" };
    return {
      rows: grid.slice(1).map((cells) => {
        const rec: Record<string, string> = {};
        header.forEach((h, i) => (rec[h] = cells[i] ?? ""));
        const values: Partial<EditableValues> = {};
        for (const f of EDITABLE_FIELDS) if (header.includes(f)) values[f] = coerce(f, rec[f]);
        return { id: rec.id?.trim() || undefined, values };
      }),
    };
  } catch (e) {
    return { rows: [], error: `Couldn't read the file: ${(e as Error).message}` };
  }
}

function same(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => (Array.isArray(v) ? (v.length ? v.join("\u0001") : null) : v === "" || v === undefined ? null : v);
  return norm(a) === norm(b);
}

export interface FieldChange {
  field: EditableField;
  from: unknown;
  to: unknown;
}
export interface ImportDiff {
  changed: { song: Song; changes: FieldChange[] }[];
  added: ImportRow[];
  unchanged: number;
  problems: string[];
}

export function diffImport(rows: ImportRow[], current: Song[]): ImportDiff {
  const byId = new Map(current.map((s) => [s.id, s]));
  const byTitle = new Map<string, Song>();
  for (const s of current) if (!s.merged_into_id) byTitle.set(normTitle(s.title), s);
  const diff: ImportDiff = { changed: [], added: [], unchanged: 0, problems: [] };
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const title = (r.values.title as string | null) ?? null;
    let song = r.id ? byId.get(r.id) : undefined;
    if (r.id && !song) {
      diff.problems.push(`Row ${i + 2}: id ${r.id.slice(0, 8)}… isn't in the library — skipped (ids can't be invented).`);
      return;
    }
    if (!song && title) song = byTitle.get(normTitle(title));
    if (!song) {
      if (!title) diff.problems.push(`Row ${i + 2}: no title — skipped.`);
      else diff.added.push(r);
      return;
    }
    if (seen.has(song.id)) {
      diff.problems.push(`Row ${i + 2}: “${song.title}” appears more than once in the file — only the first is used.`);
      return;
    }
    seen.add(song.id);
    const changes: FieldChange[] = [];
    for (const f of EDITABLE_FIELDS) {
      if (!(f in r.values)) continue;
      const cur = (song as unknown as Record<string, unknown>)[f];
      if (!same(cur, r.values[f])) changes.push({ field: f, from: cur ?? null, to: r.values[f] ?? null });
    }
    if (changes.length) diff.changed.push({ song, changes });
    else diff.unchanged++;
  });
  return diff;
}

export function formatValue(v: unknown): string {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

/** "6/8 · click 3/8", "4/4", "74 bpm · 4/4 · click 4/8 · swung" */
export function tempoLine(s: Pick<Song, "tempo_bpm" | "time_signature" | "click_signature" | "is_swung" | "bpm_feel">): string {
  const parts: string[] = [];
  if (s.tempo_bpm) parts.push(`${s.tempo_bpm} bpm`);
  if (s.time_signature) parts.push(s.time_signature);
  if (s.click_signature && s.click_signature !== s.time_signature) parts.push(`click ${s.click_signature}`);
  if (s.bpm_feel) parts.push(s.bpm_feel);
  if (s.is_swung) parts.push("swung");
  return parts.join(" · ");
}
