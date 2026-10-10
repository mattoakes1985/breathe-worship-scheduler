import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  diffImport,
  findDuplicates,
  matchesFilters,
  pairKey,
  parseCsv,
  parseImport,
  parseKeys,
  songsToCsv,
  songsToJson,
  sortSongs,
  tempoLine,
  type Song,
  type SongWithStats,
} from "./songModel";

const TODAY = new Date("2026-10-10T12:00:00Z");
let n = 0;
function song(p: Partial<Song> & { title: string }, stats: Partial<SongWithStats["stats"]> = {}, openReviews = 0): SongWithStats {
  n++;
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
    artist: null, audio_url: null, bpm_feel: null, ccli_number: null, chord_chart_url: null, click_signature: null,
    created_at: "2026-01-01T00:00:00Z", default_key: null, duration_seconds: null, is_active: true, is_swung: false,
    legacy_played_keys: [], male_key: null, merged_into_id: null, notes: null, tags: null, tempo_bpm: null,
    time_signature: null, updated_at: "2026-10-10T00:00:00Z", updated_by: null, version: 1,
    ...p,
    stats: { times_sung: 0, last_sung: null, next_planned: null, played_keys: [], ...stats },
    openReviews,
  };
}

describe("parseKeys", () => {
  it("reads the messy spreadsheet key values", () => {
    expect(parseKeys("F or Eb")).toEqual(["F", "Eb"]);
    expect(parseKeys("C (B poss)")).toEqual(["C", "B"]);
    expect(parseKeys("F/G")).toEqual(["F", "G"]);
    expect(parseKeys("E/F")).toEqual(["E", "F"]);
    expect(parseKeys("A/ G?")).toEqual(["A", "G"]);
    expect(parseKeys("Bb (A Dave)")).toEqual(["Bb", "A"]);
  });
  it("ignores initials and words", () => {
    expect(parseKeys("G / C(DA)")).toEqual(["G", "C"]);
    expect(parseKeys("D (A- Dave)")).toEqual(["D", "A"]);
    expect(parseKeys("any- bridge song")).toEqual([]);
    expect(parseKeys(null)).toEqual([]);
  });
  it("treats enharmonic spellings as one key", () => {
    expect(parseKeys("C#")).toEqual(["Db"]);
    expect(parseKeys("D/Db")).toEqual(["D", "Db"]);
    expect(parseKeys("Em")).toEqual(["Em"]);
  });
});

describe("filters", () => {
  const library = [
    song({ title: "Cornerstone", artist: "Hillsong Worship", default_key: "G", tempo_bpm: 71, tags: ["Slow"] }, { times_sung: 5, last_sung: "2026-01-11" }),
    song({ title: "Oceans", artist: "Hillsong UNITED", default_key: "G", male_key: "D", tempo_bpm: 65 }, { times_sung: 2, last_sung: "2026-09-27" }),
    song({ title: "Jehovah", artist: "Elevation Worship", default_key: "Eb", male_key: "A", tempo_bpm: 100 }, { times_sung: 5, last_sung: "2025-03-01" }),
    song({ title: "What a Beautiful Name", artist: "Hillsong Worship", default_key: "D", tempo_bpm: 68 }, { times_sung: 1, last_sung: "2025-12-01" }),
    song({ title: "Old one", artist: "Hillsong Worship", default_key: "G", tempo_bpm: 70, is_active: false }),
    song({ title: "Praise!", artist: "Elevation Worship", default_key: "D", male_key: "E", tempo_bpm: 127, legacy_played_keys: ["E", "D"] }, { times_sung: 8, last_sung: "2026-09-01" }),
  ];
  const titles = (f: Parameters<typeof matchesFilters>[1]) => library.filter((s) => matchesFilters(s, f, TODAY)).map((s) => s.title);

  it("WO-1 acceptance: slow songs in G by Hillsong last sung over 3 months ago", () => {
    expect(titles({ tempos: ["slow"], keys: ["G"], artists: ["Hillsong"], notSungMonths: 3 })).toEqual(["Cornerstone"]);
  });
  it("hides archived songs unless asked", () => {
    expect(titles({ artists: ["Hillsong"] })).not.toContain("Old one");
    expect(titles({ status: "archived" })).toEqual(["Old one"]);
  });
  it("filters by played key separately from female/male key", () => {
    expect(titles({ keys: ["E"], keyField: "played" })).toEqual(["Praise!"]);
    expect(titles({ keys: ["E"], keyField: "female" })).toEqual([]);
    expect(titles({ keys: ["E"], keyField: "male" })).toEqual(["Praise!"]);
  });
  it("BPM range, search and rotation", () => {
    expect(titles({ bpmMin: 90, bpmMax: 130 })).toEqual(["Jehovah", "Praise!"]);
    expect(titles({ q: "beautiful" })).toEqual(["What a Beautiful Name"]);
    expect(titles({ rotation: "in" })).toEqual(["Oceans", "Praise!"]); // Cornerstone: Jan = outside 6 months
    expect(titles({ rotation: "rare" })).toEqual(["Jehovah"]);
  });
  it("counts active filters", () => {
    expect(activeFilterCount({ q: "x" })).toBe(0);
    expect(activeFilterCount({ keys: ["G"], tempos: ["slow"], bpmMin: 60 })).toBe(3);
  });
  it("sorts with blanks last in both directions", () => {
    const withBlank = [...library, song({ title: "No BPM" })];
    expect(sortSongs(withBlank, { key: "bpm", dir: "asc" }).slice(-1)[0].title).toBe("No BPM");
    expect(sortSongs(withBlank, { key: "bpm", dir: "desc" }).slice(-1)[0].title).toBe("No BPM");
    expect(sortSongs(library, { key: "times_sung", dir: "desc" })[0].title).toBe("Praise!");
  });
});

describe("duplicates", () => {
  it("finds same and similar titles, respects dismissals and merges", () => {
    const a = song({ title: "Build My Life" });
    const b = song({ title: "build my life!" });
    const c = song({ title: "Freedom (Hillsong)" });
    const d = song({ title: "Freedom (Jesus Culture)" });
    const e = song({ title: "Graves into Gardens" });
    const f = song({ title: "Graves in to Gardens" });
    const g = song({ title: "Goodness of God" });
    const h = song({ title: "Goodnes of God" });
    const merged = song({ title: "Build my life", merged_into_id: a.id, is_active: false });
    const pairs = findDuplicates([a, b, c, d, e, f, g, h, merged], new Set());
    expect(pairs.map((p) => `${p.strength}: ${p.a.title} / ${p.b.title}`)).toEqual([
      "same title: Build My Life / build my life!",
      "same title: Graves into Gardens / Graves in to Gardens",
      "similar title: Freedom (Hillsong) / Freedom (Jesus Culture)",
      "similar title: Goodness of God / Goodnes of God",
    ]);
    expect(findDuplicates([c, d], new Set([pairKey(d.id, c.id)]))).toEqual([]);
  });
});

describe("export / import round trip", () => {
  const library = [
    song({ title: 'Song, with "quotes"', artist: "Someone", default_key: "F or Eb", tempo_bpm: 72, tags: ["Slow", "Communion"], notes: "line 1\nline 2", is_swung: true, click_signature: "4/8" }),
    song({ title: "Plain", time_signature: "6/8", click_signature: "3/8" }),
    song({ title: "Archived", is_active: false }),
  ];
  it("CSV export → dry-run import = zero differences", () => {
    const csv = songsToCsv(library);
    const { rows, error } = parseImport(csv, "songs.csv");
    expect(error).toBeUndefined();
    const diff = diffImport(rows, library);
    expect(diff).toEqual({ changed: [], added: [], unchanged: 3, problems: [] });
  });
  it("JSON export → dry-run import = zero differences", () => {
    const { rows } = parseImport(songsToJson(library), "songs.json");
    expect(diffImport(rows, library)).toEqual({ changed: [], added: [], unchanged: 3, problems: [] });
  });
  it("reports field changes, new songs, and refuses unknown ids", () => {
    const csv = [
      "id,title,tempo_bpm,tags",
      `${library[1].id},Plain,90,Fast`,
      ",Brand new song,120,",
      "11111111-1111-1111-1111-111111111111,Ghost,,",
    ].join("\n");
    const diff = diffImport(parseImport(csv, "x.csv").rows, library);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0].changes).toEqual([
      { field: "tempo_bpm", from: null, to: 90 },
      { field: "tags", from: null, to: ["Fast"] },
    ]);
    expect(diff.added.map((r) => r.values.title)).toEqual(["Brand new song"]);
    expect(diff.problems[0]).toMatch(/isn't in the library/);
  });
  it("matches rows without an id by title", () => {
    const diff = diffImport(parseImport("title,tempo_bpm\nPLAIN,100\n", "x.csv").rows, library);
    expect(diff.changed[0].song.title).toBe("Plain");
  });
  it("parses quoted CSV cells", () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3')).toEqual([["a", "b, c", 'd "e"'], ["1", "2", "3"]]);
  });
});

describe("tempoLine", () => {
  it("shows meter and click separately", () => {
    expect(tempoLine({ tempo_bpm: 70, time_signature: "6/8", click_signature: "3/8", is_swung: false, bpm_feel: null })).toBe("70 bpm · 6/8 · click 3/8");
    expect(tempoLine({ tempo_bpm: 74, time_signature: "4/4", click_signature: "4/8", is_swung: true, bpm_feel: null })).toBe("74 bpm · 4/4 · click 4/8 · swung");
  });
});
