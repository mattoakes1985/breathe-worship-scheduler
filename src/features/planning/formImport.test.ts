import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describeColumn, interpretForm, matchColumnsToServices, matchName, nameKey, normaliseAnswer, parseDateHeader, readCsv, readForm, readXlsx } from "./formImport";

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
    expect(() => interpretForm(readCsv("a,b\n1,2"))).toThrow(/names/);
    expect(() => interpretForm(readCsv("Name,Comments\nSam,hi"))).toThrow(/dates/);
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

describe("events from the form's date columns", () => {
  it("reads an event name and time from the header", () => {
    expect(describeColumn("Sunday 2nd August ")).toEqual({ title: null, time: null });
    expect(describeColumn("Sunday 30th August (All-in)")).toEqual({ title: null, time: null });
    expect(describeColumn("Saturday 15th August - Baptisms 6pm")).toEqual({ title: "Baptisms", time: "18:00" });
    expect(describeColumn("Christmas Eve Carols, Thursday 24th December at 18:30")).toEqual({ title: "Christmas Eve Carols", time: "18:30" });
    expect(describeColumn("Wednesday 12th August: prayer & worship night 7.30pm")).toEqual({ title: "Prayer & worship night", time: "19:30" });
    expect(describeColumn("Sunday 6th September 11.15am")).toEqual({ title: null, time: "11:15" });
  });
  it("keeps two events on the same day apart", () => {
    const csv = ["Name,Sunday 6th December,Sunday 6th December - Carol service 6pm", "Sam,Yes,No"].join("\n");
    const f = interpretForm(readCsv(csv), new Date("2026-11-20T12:00:00Z"));
    expect(f.dates.map((d) => [d.key, d.title, d.time])).toEqual([
      ["2026-12-06", null, null],
      ["2026-12-06#2", "Carol service", "18:00"],
    ]);
    expect(f.entries[0].answers).toEqual({ "2026-12-06": "yes", "2026-12-06#2": "no" });
  });
});

describe("the form decides the month's services", () => {
  const col = (date: string, extra: Partial<{ key: string; title: string | null; time: string | null; allIn: boolean }> = {}) => ({
    col: 0, header: "", date, key: extra.key ?? date, allIn: extra.allIn ?? false, title: extra.title ?? null, time: extra.time ?? null,
  });
  const defaults = { sundayTitle: "Sunday 11:15 Service", sundayTime: "11:15:00" };
  it("matches existing services, creates the rest, and lists services the form doesn't mention", () => {
    const services = [
      { id: "a", service_date: "2026-12-06", start_time: "11:15:00", title: "Sunday 11:15 Service" },
      { id: "b", service_date: "2026-12-13", start_time: "11:15:00", title: "Sunday 11:15 Service" },
      { id: "c", service_date: "2026-12-20", start_time: "11:15:00", title: "Sunday 11:15 Service" },
    ];
    const r = matchColumnsToServices(
      [col("2026-12-06"), col("2026-12-06", { key: "2026-12-06#2", title: "Carol service", time: "18:00" }), col("2026-12-13", { allIn: true }), col("2026-12-24", { title: "Christmas Eve", time: "23:00" }), col("2026-12-27")],
      services,
      defaults
    );
    expect(r.columns.map((c) => c.serviceId ?? c.create)).toEqual([
      "a",
      { title: "Carol service", time: "18:00", timeGuessed: false, allIn: false },
      "b",
      { title: "Christmas Eve", time: "23:00", timeGuessed: false, allIn: false },
      { title: "Sunday 11:15 Service", time: "11:15", timeGuessed: false, allIn: false },
    ]);
    expect(r.extras.map((s) => s.id)).toEqual(["c"]);
  });
  it("a timed column takes the service at that time; untitled weekday events get a plain name and a time to check", () => {
    const services = [
      { id: "am", service_date: "2026-12-06", start_time: "09:15:00", title: "Early" },
      { id: "late", service_date: "2026-12-06", start_time: "11:15:00", title: "Late" },
    ];
    const r = matchColumnsToServices([col("2026-12-06"), col("2026-12-06", { key: "k2", time: "11:15" }), col("2026-12-09")], services, defaults);
    expect(r.columns.map((c) => c.serviceId ?? c.create)).toEqual(["am", "late", { title: "Wednesday service", time: "11:15", timeGuessed: true, allIn: false }]);
    expect(r.extras).toEqual([]);
  });
});

describe("still reads the form when it changes", () => {
  const nov = new Date("2026-11-20T12:00:00Z");
  it("finds the names when the question is reworded, and guesses (and says so) when it isn't called Name", () => {
    expect(interpretForm(readCsv("Who are you?,Sunday 6th December\nSam,Yes"), nov).nameGuessed).toBe(false);
    const f = interpretForm(readCsv("Id,Respondent,Sunday 6th December\n1,Sam Smith,Yes\n2,Jo Park,No"), nov);
    expect(f.headers[f.nameCol]).toBe("Respondent");
    expect(f.nameGuessed).toBe(true);
    expect(f.problems[0]).toMatch(/names are taken from "Respondent"/);
    // and a hand choice wins
    expect(interpretForm(readCsv("Id,Respondent,Nickname,Sunday 6th December\n1,Sam Smith,Sammy,Yes"), nov, { nameCol: 2 }).entries[0].rawName).toBe("Sammy");
  });
  it("skips a title row above the headers, extra columns and reordered columns", () => {
    const csv = ["December rota form,,,,", "Sunday 13th December,Phone,Name,How did you hear?,Sunday 6th December", "Yes,0123,Sam,Friend,No"].join("\n");
    const f = interpretForm(readCsv(csv), nov);
    expect(f.dates.map((d) => d.date)).toEqual(["2026-12-13", "2026-12-06"]);
    expect(f.entries[0].answers).toEqual({ "2026-12-13": "yes", "2026-12-06": "no" });
  });
  it("reads semicolon CSVs with a byte-order mark", () => {
    const f = interpretForm(readCsv("\uFEFFName;Sunday 6th December;Sunday 13th December\r\nSam;Yes;No\r\n"), nov);
    expect(f.entries[0]).toMatchObject({ rawName: "Sam", answers: { "2026-12-06": "yes", "2026-12-13": "no" } });
  });
  it("reads dates written as numbers", () => {
    expect(parseDateHeader("Sun 06/12")).toEqual({ day: 6, month: 12, year: null });
    expect(parseDateHeader("6.12.26")).toEqual({ day: 6, month: 12, year: 2026 });
    expect(parseDateHeader("2026-12-06")).toEqual({ day: 6, month: 12, year: 2026 });
    expect(parseDateHeader("46362")).toEqual({ day: 6, month: 12, year: 2026 });
    expect(parseDateHeader("Arrive 9.30")).toBeNull();
  });
  it("reads a 'tick the Sundays you can do' question", () => {
    const csv = ["Name,Which Sundays can you make?", 'Sam,"Sunday 6th December;Sunday 20th December;"', "Jo,Sunday 13th December;", "Kit,"].join("\n");
    const f = interpretForm(readCsv(csv), nov);
    expect(f.dates.map((d) => d.date)).toEqual(["2026-12-06", "2026-12-13", "2026-12-20"]);
    const by = Object.fromEntries(f.entries.map((e) => [e.rawName, e.answers]));
    expect(by.Sam).toEqual({ "2026-12-06": "yes", "2026-12-13": "no", "2026-12-20": "yes" });
    expect(by.Jo).toEqual({ "2026-12-06": "no", "2026-12-13": "yes", "2026-12-20": "no" });
    expect(by.Kit).toEqual({ "2026-12-06": null, "2026-12-13": null, "2026-12-20": null });
  });
  it("understands more ways of answering", () => {
    expect(["Can't", "cannot make it", "Away", "Not free"].map(normaliseAnswer)).toEqual(["no", "no", "no", "no"]);
    expect(["Available", "Yes please", "Happy to", "✓"].map(normaliseAnswer)).toEqual(["yes", "yes", "yes", "yes"]);
    expect(["If needed", "Not sure", "Probably"].map(normaliseAnswer)).toEqual(["maybe", "maybe", "maybe"]);
    expect(["You can count me out", "Yesterday"].map(normaliseAnswer)).toEqual([null, null]);
  });
  it("warns when a header's weekday doesn't match its date", () => {
    const f = interpretForm(readCsv("Name,Sunday 7th December\nSam,Yes"), nov);
    expect(f.problems.join(" ")).toMatch(/7\/12\/2026 is a Monday —/);
    expect(interpretForm(readCsv("Name,Sunday 24th December\nSam,Yes"), nov).problems.join(" ")).toMatch(/is a Thursday —/);
  });
  it("finds the responses on another worksheet, and reads US-style times", () => {
    const bytes = new Uint8Array(readFileSync(new URL("./__fixtures__/two-sheets.xlsx", import.meta.url)));
    const { form, sheet, sheets } = readForm({ name: "December.xlsx", bytes });
    expect([sheet, sheets]).toEqual([1, 2]);
    expect(form.headers[form.nameCol]).toBe("Your name please");
    expect(form.dates.map((d) => d.date)).toEqual(["2026-12-06", "2026-12-13"]);
    expect(form.entries.map((e) => [e.rawName, e.answers["2026-12-06"], e.answers["2026-12-13"], e.submittedAt])).toEqual([
      ["Person A", "yes", "no", "2026-11-20 10:05"],
      ["Person B", "maybe", "yes", "2026-11-21 10:05"],
    ]);
    expect(form.entries[1].request).toBe("Only one please");
  });
});
