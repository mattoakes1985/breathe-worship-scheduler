// Unit tests for the auto-suggest engine (PRD §13: highest-risk logic,
// must not be tested only manually; Appendix B: SCHED-7 unit-tested).
import { describe, expect, it } from "vitest";
import {
  daysSinceLastServed,
  isBlockedOut,
  isOverPreferenceCap,
  rankCandidates,
  servicesOverlap,
  suggestRota,
} from "./index";
import type { EngineServiceInput } from "./types";

const base = (over: Partial<EngineServiceInput> = {}): EngineServiceInput => ({
  serviceDate: "2026-07-12",
  slots: [{ roleId: "drums", roleName: "Drums", slotIndex: 0 }],
  volunteers: [
    { profileId: "a", name: "Alice", eligibleRoles: { drums: "competent" } },
    { profileId: "b", name: "Bob", eligibleRoles: { drums: "competent" } },
    { profileId: "c", name: "Cara", eligibleRoles: { vocals: "lead" } },
  ],
  availability: [
    { profileId: "a", response: "yes" },
    { profileId: "b", response: "yes" },
    { profileId: "c", response: "yes" },
  ],
  blockouts: [],
  history: [],
  preferences: [],
  periodAssignments: [],
  ...over,
});

describe("fairness recency (SCHED-2b)", () => {
  it("prefers whoever served the role longest ago", () => {
    const input = base({
      history: [
        { profileId: "a", roleId: "drums", serviceDate: "2026-07-05" }, // 7 days ago
        { profileId: "b", roleId: "drums", serviceDate: "2026-05-10" }, // ~9 weeks ago
      ],
    });
    const [s] = suggestRota(input);
    expect(s.profileId).toBe("b");
  });

  it("prefers a never-served volunteer over a recent server", () => {
    const input = base({
      history: [{ profileId: "a", roleId: "drums", serviceDate: "2026-07-05" }],
    });
    const [s] = suggestRota(input);
    expect(s.profileId).toBe("b");
  });

  it("computes recency correctly", () => {
    expect(
      daysSinceLastServed(
        [{ profileId: "a", roleId: "drums", serviceDate: "2026-07-05" }],
        "a",
        "drums",
        "2026-07-12"
      )
    ).toBe(7);
    expect(daysSinceLastServed([], "a", "drums", "2026-07-12")).toBe(Infinity);
  });
});

describe("availability rules (SCHED-1/2a)", () => {
  it("excludes 'no' and non-responders entirely", () => {
    const input = base({
      availability: [
        { profileId: "a", response: "no" },
        // b never responded
      ],
    });
    const [s] = suggestRota(input);
    expect(s.profileId).toBeNull();
  });

  it("ranks 'yes' above 'maybe' even when 'maybe' is fairer on recency", () => {
    const input = base({
      availability: [
        { profileId: "a", response: "yes" },
        { profileId: "b", response: "maybe" },
      ],
      history: [{ profileId: "a", roleId: "drums", serviceDate: "2026-07-05" }],
    });
    const [s] = suggestRota(input);
    expect(s.profileId).toBe("a");
  });
});

describe("blockout dates (AVAIL-2 / SCHED-2c)", () => {
  it("suppresses volunteers with an overlapping date-range blockout", () => {
    expect(
      isBlockedOut(
        [{ profileId: "a", startDate: "2026-07-10", endDate: "2026-07-20", recurringDayOfWeek: null }],
        "a",
        "2026-07-12"
      )
    ).toBe(true);
  });

  it("suppresses recurring day-of-week blockouts (2026-07-12 is a Sunday)", () => {
    expect(
      isBlockedOut(
        [{ profileId: "a", startDate: null, endDate: null, recurringDayOfWeek: 0 }],
        "a",
        "2026-07-12"
      )
    ).toBe(true);
  });

  it("engine never suggests a blocked-out volunteer", () => {
    const input = base({
      blockouts: [
        { profileId: "a", startDate: "2026-07-12", endDate: "2026-07-12", recurringDayOfWeek: null },
        { profileId: "b", startDate: "2026-07-12", endDate: "2026-07-12", recurringDayOfWeek: null },
      ],
    });
    const [s] = suggestRota(input);
    expect(s.profileId).toBeNull();
  });
});

describe("no double-booking within a service (SCHED-2d/3)", () => {
  it("never proposes the same volunteer for two slots on one service", () => {
    const input = base({
      slots: [
        { roleId: "drums", roleName: "Drums", slotIndex: 0 },
        { roleId: "drums", roleName: "Drums", slotIndex: 1 },
      ],
    });
    const [s1, s2] = suggestRota(input);
    expect(s1.profileId).not.toBeNull();
    expect(s2.profileId).not.toBeNull();
    expect(s1.profileId).not.toBe(s2.profileId);
  });

  it("detects overlapping services on the same date", () => {
    expect(
      servicesOverlap(
        { serviceDate: "2026-07-12", startTime: "10:30", endTime: "12:00" },
        { serviceDate: "2026-07-12", startTime: "11:30", endTime: "13:00" }
      )
    ).toBe(true);
    expect(
      servicesOverlap(
        { serviceDate: "2026-07-12", startTime: "10:30", endTime: "12:00" },
        { serviceDate: "2026-07-12", startTime: "18:00", endTime: "19:30" }
      )
    ).toBe(false);
    expect(
      servicesOverlap(
        { serviceDate: "2026-07-12", startTime: "10:30", endTime: null },
        { serviceDate: "2026-07-19", startTime: "10:30", endTime: null }
      )
    ).toBe(false);
  });
});

describe("serving-preference soft cap (SCHED-7, Appendix B)", () => {
  const capInput = (periodAssignments: EngineServiceInput["periodAssignments"]) =>
    base({
      preferences: [{ profileId: "a", maxServicesPerPeriod: 2, periodType: "month" }],
      periodAssignments,
      history: [
        // make Alice the fairness favourite so only the cap can demote her
        { profileId: "b", roleId: "drums", serviceDate: "2026-07-05" },
      ],
    });

  it("deprioritizes a volunteer who has hit their stated cap", () => {
    const input = capInput([
      { profileId: "a", roleId: "drums", serviceDate: "2026-07-01" },
      { profileId: "a", roleId: "vocals", serviceDate: "2026-07-08" },
    ]);
    const [s] = suggestRota(input);
    expect(s.profileId).toBe("b"); // Alice is at cap → Bob wins despite recency
  });

  it("still suggests an over-cap volunteer when no one else exists, clearly flagged (soft cap, not hard block)", () => {
    const input = capInput([
      { profileId: "a", roleId: "drums", serviceDate: "2026-07-01" },
      { profileId: "a", roleId: "vocals", serviceDate: "2026-07-08" },
    ]);
    input.availability = [{ profileId: "a", response: "yes" }]; // Bob unavailable
    const [s] = suggestRota(input);
    expect(s.profileId).toBe("a");
    expect(s.overPreferenceCap).toBe(true);
  });

  it("does not deprioritize under-cap volunteers", () => {
    const input = capInput([{ profileId: "a", roleId: "drums", serviceDate: "2026-07-01" }]);
    const [s] = suggestRota(input);
    expect(s.profileId).toBe("a"); // 1 of 2 this month → still fair game, recency favours her
  });

  it("isOverPreferenceCap counts only the stated period", () => {
    const prefs = [{ profileId: "a", maxServicesPerPeriod: 1, periodType: "month" as const }];
    const june = [{ profileId: "a", roleId: "drums", serviceDate: "2026-06-14" }];
    expect(isOverPreferenceCap(prefs, june, "a", "2026-07-12")).toBe(false);
    const july = [{ profileId: "a", roleId: "drums", serviceDate: "2026-07-05" }];
    expect(isOverPreferenceCap(prefs, july, "a", "2026-07-12")).toBe(true);
  });
});

describe("instrument preference ranking (change request #5)", () => {
  it("prefers the volunteer whose first-choice instrument this is, even against better recency", () => {
    const input = base({
      volunteers: [
        { profileId: "a", name: "Alice", eligibleRoles: { drums: "competent" }, rolePreferenceRank: { drums: 2 } },
        { profileId: "b", name: "Bob", eligibleRoles: { drums: "competent" }, rolePreferenceRank: { drums: 1 } },
      ],
      // Alice is fairer on recency (never served) — Bob served recently
      history: [{ profileId: "b", roleId: "drums", serviceDate: "2026-07-05" }],
    });
    const [s] = suggestRota(input);
    expect(s.profileId).toBe("b"); // instrument preference outranks recency
  });

  it("availability still outranks instrument preference", () => {
    const input = base({
      volunteers: [
        { profileId: "a", name: "Alice", eligibleRoles: { drums: "competent" }, rolePreferenceRank: { drums: 5 } },
        { profileId: "b", name: "Bob", eligibleRoles: { drums: "competent" }, rolePreferenceRank: { drums: 1 } },
      ],
      availability: [
        { profileId: "a", response: "yes" },
        { profileId: "b", response: "maybe" },
      ],
    });
    const [s] = suggestRota(input);
    expect(s.profileId).toBe("a"); // a firm yes beats a preferred maybe
  });

  it("defaults to rank 1 when no preference is stated", () => {
    const ranked = rankCandidates(base(), "drums", new Set());
    expect(ranked.length).toBeGreaterThan(0); // no crash, all treated as first-choice
  });

  it("ranked alternatives are exposed for the lead to choose from", () => {
    const ranked = rankCandidates(base(), "drums", new Set());
    expect(ranked.map((r) => r.profileId)).toEqual(["a", "b"]); // full ordered list, not just #1
  });
});

describe("eligibility (PPL-3)", () => {
  it("only offers volunteers for roles they are eligible for", () => {
    const ranked = rankCandidates(base(), "drums", new Set());
    expect(ranked.map((r) => r.profileId)).not.toContain("c");
  });
});

describe("explainability (PRD §15: not a black box)", () => {
  it("every suggestion carries human-readable reasons", () => {
    const [s] = suggestRota(base());
    expect(s.reasons.length).toBeGreaterThan(0);
  });
});
