import { describe, expect, it } from "vitest";
import { buildBand, scheduleCsv, setLine } from "./scheduleModel";

const order = new Map([["Worship Leader", 1], ["Vocalist", 2], ["Acoustic Guitar", 4], ["Drums", 8]]);
const R = (name: string) => ({ name, sort_order: order.get(name) ?? 99 });

describe("buildBand", () => {
  it("prefers the published band and groups names by role in role order", () => {
    const band = buildBand({
      publishedRota: [
        { role: "Drums", slot: 0, name: "Dani" },
        { role: "Worship Leader", slot: 0, name: "Alex" },
        { role: "Vocalist", slot: 0, name: "Bea" },
        { role: "Vocalist", slot: 1, name: "Kit" },
      ],
      assignments: [{ role: R("Worship Leader"), name: "Alex Account" }],
      legacy: [{ role: R("Drums"), name: "Old" }],
      roleOrder: order,
    });
    expect(band.source).toBe("published");
    expect(band.lines).toEqual([
      { role: "Worship Leader", names: ["Alex"] },
      { role: "Vocalist", names: ["Bea", "Kit"] },
      { role: "Drums", names: ["Dani"] },
    ]);
  });
  it("flags cover requests on a published band", () => {
    const band = buildBand({
      publishedRota: [{ role: "Drums", name: "Dani" }],
      assignments: [{ role: R("Drums"), name: "Dani", needsCover: true }],
      legacy: [],
      roleOrder: order,
    });
    expect(band.lines[0].needsCover).toBe(true);
  });
  it("falls back to assignments, then history, then (planners) the plan — never mixing", () => {
    expect(buildBand({ publishedRota: [], assignments: [{ role: R("Drums"), name: "Dani" }], legacy: [{ role: R("Drums"), name: "Old" }], roleOrder: order }).source).toBe("assignments");
    const h = buildBand({ publishedRota: null, assignments: [], legacy: [{ role: null, name: "Old" }, { role: null, name: "Old" }], roleOrder: order });
    expect(h).toEqual({ source: "history", lines: [{ role: "Serving", names: ["Old"] }] });
    expect(buildBand({ publishedRota: [], assignments: [], legacy: [], plan: [{ role: R("Drums"), name: "P" }], roleOrder: order }).source).toBe("plan");
    expect(buildBand({ publishedRota: [], assignments: [], legacy: [], roleOrder: order })).toEqual({ source: "none", lines: [] });
  });
  it("ignores blank names and junk in the published band", () => {
    const band = buildBand({ publishedRota: [{ role: "Drums", name: " " }, "x", { name: "No role" }], assignments: [], legacy: [], roleOrder: order });
    expect(band.lines).toEqual([{ role: "Serving", names: ["No role"] }]);
  });
});

describe("set lines and CSV", () => {
  const songs = [{ order: 2, title: "No Body", key: "A" }, { order: 1, title: "Echoes", key: null }];
  it("lists songs in order with keys", () => {
    expect(setLine(songs)).toBe("Echoes, No Body (A)");
  });
  it("writes one row per person and per song, quoting where needed", () => {
    const csv = scheduleCsv([
      { date: "2026-11-01", time: "11:15", title: "Sunday, 11:15", theme: "Hope", preacher: null, band: { source: "published", lines: [{ role: "Vocalist", names: ["Bea", "Kit"] }] }, songs },
      { date: "2026-11-08", time: "11:15", title: "Sunday", band: { source: "none", lines: [] }, songs: [] },
    ]).split("\n");
    expect(csv).toEqual([
      "Date,Time,Service,Theme,Preacher,Role,Name",
      '2026-11-01,11:15,"Sunday, 11:15",Hope,,Vocalist,Bea',
      '2026-11-01,11:15,"Sunday, 11:15",Hope,,Vocalist,Kit',
      '2026-11-01,11:15,"Sunday, 11:15",Hope,,Song 1,Echoes',
      '2026-11-01,11:15,"Sunday, 11:15",Hope,,Song 2,No Body (A)',
      "2026-11-08,11:15,Sunday,,,,",
    ]);
  });
});
