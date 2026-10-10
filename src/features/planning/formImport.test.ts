import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { interpretForm, matchName, nameKey, normaliseAnswer, parseDateHeader, readCsv, readXlsx } from "./formImport";

// Anonymised copy of the real August 2026 MS Forms export (names replaced
// with "Person N", emails and requests blanked). Same layout, same answers.
const fixture = new Uint8Array(readFileSync(new URL("./__fixtures__/august-anon.xlsx", import.meta.url)));

describe("reading the MS Forms export", () => {
  it("finds the name, request, submitted and date columns", () => {
    const f = interpretForm(readXlsx(fixture));
    expect(f.dates.map((d) => d.date)).toEqual(["2026-08-02", "2026-08-09", "2026-08-16", "2026-08-23", "2026-08-30"]);
    expect(f.dates.map((d) => d.allIn)).toEqual([false, false, false, false, true]);
    expect(f.month).toBe("2026-08");
    expect(f.entries).toHaveLength(15);
    expect(f.entries.every((e) => e.rawName.startsWith("Person "))).toBe(true);
    expect(f.entries.filter((e) => e.request)).toHaveLength(1);
    expect(f.problems).toEqual([]);
  });

  it("reads mixed-case Yes/No answers", () => {
    const f = interpretForm(readXlsx(fixture));
    const yes = f.entries.flatMap((e) => Object.values(e.answers)).filter((a) => a === "yes").length;
    expect(yes).toBe(29);
  });

  it("keeps only the latest submission per person", () => {
    const csv = [
      "Id,Completion time,Name1,Sunday 6th September,Sunday 13th September,Any requests",
      "1,2026-08-20 10:00,Tim D,Yes,Yes,",
      "2,2026-08-25 09:00,tim  d,No,Yes,changed my mind",
      "3,2026-08-21 08:00,Baz,YES,NO,",
    ].join("\n");
    const f = interpretForm(readCsv(csv));
    const tim = f.entries.find((e) => e.key === "tim d")!;
    expect(tim.answers).toEqual({ "2026-09-06": "no", "2026-09-13": "yes" });
    expect(tim.request).toBe("changed my mind");
    expect(tim.superseded).toBe(1);
    expect(f.entries).toHaveLength(2);
  });

  it("works out the year from when the form was filled in", () => {
    const csv = ["Completion time,Name,Sunday 3rd January", "2026-12-14 12:00,Sam,Yes"].join("\n");
    expect(interpretForm(readCsv(csv)).dates[0].date).toBe("2027-01-03");
  });

  it("reports answers it can't read instead of guessing", () => {
    const csv = ["Name,Sunday 4th October", "Sam,Only in the evening"].join("\n");
    const f = interpretForm(readCsv(csv), new Date(2026, 8, 20));
    expect(f.entries[0].answers["2026-10-04"]).toBeNull();
    expect(f.problems[0]).toMatch(/didn't understand/);
  });

  it("rejects files that aren't a form export", () => {
    expect(() => readXlsx(new TextEncoder().encode("not a zip"))).toThrow(/Excel/);
    expect(() => interpretForm(readCsv("a,b\n1,2"))).toThrow(/Name column/);
    expect(() => interpretForm(readCsv("Name,Comments\nSam,hi"))).toThrow(/date columns/);
  });
});

describe("pieces", () => {
  it("parses date headers in the forms people actually write", () => {
    expect(parseDateHeader("Sunday 2nd August ")).toEqual({ day: 2, month: 8, year: null });
    expect(parseDateHeader("Sunday 30th August (All-in)")).toEqual({ day: 30, month: 8, year: null });
    expect(parseDateHeader("Sun 6 Sept 2026")).toEqual({ day: 6, month: 9, year: 2026 });
    expect(parseDateHeader("September 13th")).toEqual({ day: 13, month: 9, year: null });
    expect(parseDateHeader("Any requests")).toBeNull();
  });

  it("normalises answers", () => {
    expect(["Yes", "YES", " y ", "No", "NO", "maybe", "If needed", ""].map(normaliseAnswer)).toEqual(["yes", "yes", "yes", "no", "no", "maybe", "maybe", null]);
  });

  it("handles quoted CSV fields", () => {
    expect(readCsv('a,"b, c","say ""hi"""\r\n1,2,3')).toEqual([["a", "b, c", 'say "hi"'], ["1", "2", "3"]]);
  });
});

describe("name matching", () => {
  const people = [
    { id: "1", name: "Tim Davies" },
    { id: "2", name: "Barry Smith" },
    { id: "3", name: "Dave Asplin" },
  ];
  it("uses a remembered alias first", () => {
    const aliases = new Map([[nameKey("Baz"), "2"]]);
    expect(matchName(" baz ", aliases, people)).toEqual({ personId: "2", how: "alias", suggestions: [] });
  });
  it("matches an exact name", () => {
    expect(matchName("dave  asplin", new Map(), people).personId).toBe("3");
  });
  it("only suggests (never auto-picks) near matches", () => {
    const m = matchName("Tim D", new Map(), people);
    expect(m.personId).toBeNull();
    expect(m.suggestions.map((p) => p.id)).toEqual(["1"]);
  });
});
