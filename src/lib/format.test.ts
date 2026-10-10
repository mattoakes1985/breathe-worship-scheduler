import { describe, expect, it } from "vitest";
import { toLocalISODate } from "./format";

describe("toLocalISODate", () => {
  it("keeps the local calendar day during British Summer Time", () => {
    // Local midnight on Sunday 6 Sept 2026; toISOString() would give 2026-09-05 in BST.
    expect(toLocalISODate(new Date(2026, 8, 6))).toBe("2026-09-06");
    expect(toLocalISODate(new Date(2026, 8, 6, 23, 30))).toBe("2026-09-06");
  });
  it("works in winter too", () => {
    expect(toLocalISODate(new Date(2026, 10, 1))).toBe("2026-11-01");
  });
});
