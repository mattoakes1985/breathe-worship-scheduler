import { describe, expect, it } from "vitest";
import { buildMonthGrid, columnText, dateHeader, monthXlsx, runSheet, songLine, type GridInput } from "./gridModel";
import { readXlsx } from "./formImport";

const LEAD = "lead", VOX = "vox", PA = "pa";
const rows = [
  { label: "Lead", role_id: LEAD, slot: 0 },
  { label: "Lead", role_id: LEAD, slot: 1 },
  { label: "Vox", role_id: VOX, slot: 0 },
  { label: "PA", role_id: PA, slot: 0 },
];
const svc = (id: string, date: string, start: string, o: Partial<GridInput["services"][number]> = {}) => ({
  id, date, start_time: start, title: "Sunday Service", theme: null, other_items: null, preacher: null, events_note: null, linked_service_id: null, is_all_in: false, ...o,
});

describe("sheet formatting", () => {
  it("writes dates the way the sheet does", () => {
    expect(dateHeader("2026-08-02", ["11:15:00"])).toBe("Sunday 2nd August 11.15");
    expect(dateHeader("2026-09-06", ["09:15:00", "11:15:00"])).toBe("Sunday 6th September DOUBLE 9.15 & 11.15");
    expect(dateHeader("2026-11-22", ["11:15"])).toBe("Sunday 22nd November 11.15");
    expect(dateHeader("2026-11-11", [])).toBe("Wednesday 11th November");
  });
  it("writes song lines, showing the click only when it differs", () => {
    expect(songLine(1, { title: "Echoes", key: "G", bpm: 142, time_signature: "4/4", click_signature: null })).toBe("1. Echoes - G 142bpm 4/4");
    expect(songLine(4, { title: "Made for more", key: "C", bpm: 75, time_signature: "6/8", click_signature: "3/8" })).toBe("4. Made for more - C 75bpm 6/8 (3/8 click)");
    expect(songLine(2, { title: "Away in a Manger", key: null, bpm: null, time_signature: null, click_signature: null })).toBe("2. Away in a Manger");
  });
  it("places running-order lines between songs", () => {
    const songs = [1, 2, 3].map((i) => ({ service_id: "s", order_index: i, title: `Song ${i}`, key: null, bpm: null, time_signature: null, click_signature: null }));
    const flow = [
      { id: "w", service_id: "s", order_index: 1, title: "Welcome", after_song: 1 },
      { id: "k", service_id: "s", order_index: 1, title: "Kids Exit", after_song: 2 },
      { id: "o", service_id: "s", order_index: 2, title: "Offering", after_song: 2 },
      { id: "c", service_id: "s", order_index: 1, title: "Close", after_song: null },
      { id: "p", service_id: "s", order_index: 1, title: "Prayer", after_song: 0 },
    ];
    expect(runSheet(songs, flow).map((l) => l.text)).toEqual(["Prayer", "1. Song 1", "Welcome", "2. Song 2", "Kids Exit", "Offering", "3. Song 3", "Close"]);
  });
});

describe("month grid", () => {
  const input: GridInput = {
    month: "2026-09",
    services: [
      svc("a9", "2026-09-06", "09:15:00", { linked_service_id: "a11" }),
      svc("a11", "2026-09-06", "11:15:00", { linked_service_id: "a9", theme: "Far reaching", other_items: "Communion" }),
      svc("b", "2026-09-13", "11:15:00", { is_all_in: true, events_note: "Bring and share" }),
    ],
    rows,
    slots: [
      { service_id: "a9", role_id: LEAD, slot_index: 0, name: "Dave A" },
      { service_id: "a9", role_id: PA, slot_index: 0, name: "Ivo" },
      { service_id: "b", role_id: VOX, slot_index: 0, name: "Kit" },
    ],
    songs: [{ service_id: "a9", order_index: 1, title: "Echoes", key: "G", bpm: 142, time_signature: "4/4", click_signature: null }],
    flow: [{ id: "w", service_id: "a9", order_index: 1, title: "Welcome", after_song: 1 }],
    available: [
      { service_id: "a9", name: "Kit" }, { service_id: "a11", name: "Kit" }, { service_id: "a11", name: "Baz" },
      { service_id: "b", name: "Dave A" },
    ],
  };
  const grid = buildMonthGrid(input);

  it("merges a linked double Sunday into one column", () => {
    expect(grid.title).toBe("SEPTEMBER 2026");
    expect(grid.columns.map((c) => c.header)).toEqual(["Sunday 6th September DOUBLE 9.15 & 11.15", "Sunday 13th September 11.15"]);
  });

  it("uses the sheet's row order, with Events before PA", () => {
    expect(grid.rows.map((r) => r.label)).toEqual(["Theme", "Date", "Other Items", "Preach", "Lead", "Lead", "Vox", "Events", "PA"]);
    expect(grid.rows.find((r) => r.label === "Theme")!.cells).toEqual(["Far reaching", ""]);
    expect(grid.rows.find((r) => r.label === "Other Items")!.cells).toEqual(["Communion", "All-in"]);
    expect(grid.rows.find((r) => r.label === "Events")!.cells).toEqual(["", "Bring and share"]);
    expect(grid.rows.filter((r) => r.label === "Lead").map((r) => r.cells[0])).toEqual(["Dave A", ""]);
  });

  it("lists who said yes, once per person", () => {
    expect(grid.availability).toEqual([["Baz", "Kit"], ["Dave A"]]);
  });

  it("copies a Sunday as text", () => {
    expect(columnText(grid, 0)).toBe(
      ["Sunday 6th September DOUBLE 9.15 & 11.15", "Theme: Far reaching", "Other Items: Communion", "Lead: Dave A", "PA: Ivo", "", "Songs", "1. Echoes - G 142bpm 4/4", "  Welcome"].join("\n")
    );
  });

  it("exports an .xlsx in the sheet's layout that reads back correctly", () => {
    const back = readXlsx(monthXlsx(grid));
    expect(back.map((r) => r[0] ?? "")).toEqual(["Theme", "Date", "Other Items", "Preach", "Lead", "Lead", "Vox", "Events", "PA", "Songs", "", "", "Availability", ""]);
    expect(back[1].slice(1)).toEqual(["Sunday 6th September DOUBLE 9.15 & 11.15", "Sunday 13th September 11.15"]);
    expect(back[10][1]).toBe("1. Echoes - G 142bpm 4/4");
    expect(back[11][1]).toBe("Welcome");
    expect(back[12].slice(1)).toEqual(["Baz", "Dave A"]);
  });

  it("escapes awkward text safely in the export", () => {
    const g = buildMonthGrid({ ...input, services: [svc("x", "2026-09-20", "11:15", { theme: `Fish & <chips> "now"\u0007` })], slots: [], songs: [], flow: [], available: [] });
    expect(readXlsx(monthXlsx(g))[0][1]).toBe(`Fish & <chips> "now"`);
  });
});
