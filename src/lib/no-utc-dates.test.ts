// Guard: calendar dates must never be derived via toISOString(), which converts
// to UTC and shifts local midnight back a day during British Summer Time (this
// once put every summer service on a Saturday). Use toLocalISODate() instead.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = `${dir}/${name}`;
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

describe("date handling", () => {
  it("never slices a UTC ISO string to get a calendar date", () => {
    const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
    const offenders = walk(root).filter((f) => /toISOString\(\)\s*\.\s*(slice|substring|substr)\(\s*0\s*,\s*10\s*\)|toISOString\(\)\s*\.\s*split\(\s*["']T["']\s*\)/.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => f.slice(root.length + 1))).toEqual([]);
  });
});
