import { describe, expect, it } from "vitest";
import {
  checkPlan,
  DEFAULT_SOFT_ORDER,
  planMonth,
  suggestHouseholds,
  type PlanInput,
  type PlanPerson,
  type PlanResponse,
  type PlanService,
} from "./monthPlanner";

const LEAD = "lead", DRUMS = "drums", SOUND = "sound", AC = "acoustic", EL = "electric", KEYS = "keys", VOX = "vox", BASS = "bass";
const roleNames = { lead: "Lead", drums: "Drums", sound: "Sound", acoustic: "Acoustic", electric: "Electric", keys: "Keys", vox: "Vox", bass: "Bass" };
const CORE = [
  { label: "Lead", roleIds: [LEAD] },
  { label: "Drums", roleIds: [DRUMS] },
  { label: "Sound", roleIds: [SOUND] },
  { label: "Acoustic, Electric or Keys", roleIds: [AC, EL, KEYS] },
];

const sundays = ["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"];
function svc(date: string, roles: string[], extra: Partial<PlanService> = {}): PlanService {
  return { id: `s-${date}`, date, startTime: "11:15", isAllIn: false, linkedServiceId: null, slots: roles.map((r) => ({ roleId: r, slotIndex: 0 })), ...extra };
}
function person(id: string, roles: Record<string, number>, extra: Partial<PlanPerson> = {}): PlanPerson {
  return { id, name: id, roles, maxPerMonth: null, householdId: null, ...extra };
}
function input(over: Partial<PlanInput>): PlanInput {
  return {
    month: "2026-11",
    services: [],
    people: [],
    households: [],
    availability: [],
    history: [],
    locks: [],
    rules: { plannedRoleIds: null, coreGroups: CORE, allIn: true, softOrder: DEFAULT_SOFT_ORDER, restGapWeeks: 1, defaultMaxPerMonth: null },
    roleNames,
    ...over,
  };
}
const all = (people: string[], services: PlanService[], response: PlanResponse = "yes") =>
  people.flatMap((p) => services.map((s) => ({ personId: p, serviceId: s.id, response })));
const who = (r: ReturnType<typeof planMonth>, serviceId: string, roleId: string) =>
  r.slots.find((s) => s.serviceId === serviceId && s.roleId === roleId && !s.extra)?.personId ?? null;

describe("hard constraints", () => {
  it("never schedules someone who said no, didn't respond, or doesn't play the role", () => {
    const s = svc(sundays[0], [DRUMS]);
    const r = planMonth(input({
      services: [s],
      people: [person("no", { drums: 1 }), person("silent", { drums: 1 }), person("keysOnly", { keys: 1 })],
      availability: [{ personId: "no", serviceId: s.id, response: "no" }, { personId: "keysOnly", serviceId: s.id, response: "yes" }],
    }));
    expect(who(r, s.id, DRUMS)).toBeNull();
    expect(r.coreGaps.map((g) => g.label)).toContain("Drums");
  });

  it("never puts one person in two roles on the same service", () => {
    const s = svc(sundays[0], [LEAD, VOX]);
    const r = planMonth(input({ services: [s], people: [person("a", { lead: 1, vox: 1 })], availability: all(["a"], [s]) }));
    expect(r.slots.filter((x) => x.personId === "a")).toHaveLength(1);
  });

  it("does not double-book across two unlinked services on the same day, but mirrors linked ones", () => {
    const early = svc(sundays[0], [DRUMS], { id: "early", startTime: "09:15" });
    const late = svc(sundays[0], [DRUMS], { id: "late" });
    const r1 = planMonth(input({ services: [early, late], people: [person("d", { drums: 1 })], availability: all(["d"], [early, late]) }));
    expect(who(r1, "early", DRUMS)).toBe("d");
    expect(who(r1, "late", DRUMS)).toBeNull();

    const lateLinked = { ...late, linkedServiceId: "early" };
    const r2 = planMonth(input({ services: [early, lateLinked], people: [person("d", { drums: 1 })], availability: all(["d"], [early, lateLinked]) }));
    expect(who(r2, "late", DRUMS)).toBe("d");
    expect(r2.load.d).toBe(1); // a double Sunday counts once
  });
});

describe("core roles", () => {
  it("fills core roles before anything else", () => {
    // 'flex' plays keys and bass; bass is listed first on the service, but keys
    // is the only way to satisfy the Acoustic/Electric/Keys core group.
    const s = svc(sundays[0], [BASS, KEYS, LEAD, DRUMS, SOUND]);
    const r = planMonth(input({
      services: [s],
      people: [person("flex", { bass: 1, keys: 2 }), person("l", { lead: 1 }), person("d", { drums: 1 }), person("snd", { sound: 1 })],
      availability: all(["flex", "l", "d", "snd"], [s]),
    }));
    expect(who(r, s.id, KEYS)).toBe("flex");
    expect(who(r, s.id, BASS)).toBeNull();
    expect(r.coreGaps).toHaveLength(0);
  });

  it("treats any one of Acoustic, Electric or Keys as enough", () => {
    const s = svc(sundays[0], [AC, EL, KEYS]);
    const r = planMonth(input({ services: [s], people: [person("e", { electric: 1 })], availability: all(["e"], [s]) }));
    expect(r.coreGaps.find((g) => g.label.startsWith("Acoustic"))).toBeUndefined();
    expect(r.unfilled.map((u) => u.roleId).sort()).toEqual([AC, KEYS]);
  });

  it("reports a core gap with the closest people, never hiding it", () => {
    const s = svc(sundays[0], [LEAD]);
    const r = planMonth(input({
      services: [s],
      people: [person("pending", { lead: 1 }), person("declined", { lead: 1 })],
      availability: [{ personId: "declined", serviceId: s.id, response: "no" }],
    }));
    const gap = r.coreGaps.find((g) => g.label === "Lead")!;
    expect(gap.closest.map((c) => [c.name, c.why])).toEqual([["pending", "hasn't responded"], ["declined", "said no"]]);
  });

  it("relaxes the rest week to fill a core role, and says so", () => {
    const [w1, w2] = [svc(sundays[0], [DRUMS]), svc(sundays[1], [DRUMS])];
    const r = planMonth(input({ services: [w1, w2], people: [person("onlyDrummer", { drums: 1 })], availability: all(["onlyDrummer"], [w1, w2]) }));
    expect(who(r, w2.id, DRUMS)).toBe("onlyDrummer");
    const slot = r.slots.find((x) => x.serviceId === w2.id)!;
    expect(slot.relaxed.join(" ")).toMatch(/within 1 week/);
  });
});

describe("spread the load", () => {
  it("avoids consecutive Sundays when someone else is available", () => {
    const services = sundays.slice(0, 2).map((d) => svc(d, [DRUMS]));
    const r = planMonth(input({ services, people: [person("a", { drums: 1 }), person("b", { drums: 1 })], availability: all(["a", "b"], services) }));
    expect(who(r, services[0].id, DRUMS)).not.toBe(who(r, services[1].id, DRUMS));
  });

  it("counts history from the previous month for the rest week", () => {
    const s = svc(sundays[0], [DRUMS]);
    const r = planMonth(input({
      services: [s],
      people: [person("a", { drums: 1 }), person("b", { drums: 1 })],
      availability: all(["a", "b"], [s]),
      history: [{ personId: "a", date: "2026-10-25" }],
    }));
    expect(who(r, s.id, DRUMS)).toBe("b");
  });

  it("prefers whoever served longest ago", () => {
    const s = svc(sundays[2], [BASS]);
    const r = planMonth(input({
      services: [s],
      people: [person("recent", { bass: 1 }), person("ages", { bass: 1 })],
      availability: all(["recent", "ages"], [s]),
      history: [{ personId: "recent", date: "2026-10-18" }, { personId: "ages", date: "2026-06-07" }],
    }));
    expect(who(r, s.id, BASS)).toBe("ages");
  });
});

describe("monthly limit (soft cap)", () => {
  it("prefers people under their limit, and flags it when relaxed", () => {
    const services = [sundays[0], sundays[2]].map((d) => svc(d, [VOX]));
    const r = planMonth(input({
      services,
      people: [person("capped", { vox: 1 }, { maxPerMonth: 1 }), person("free", { vox: 2 })],
      availability: all(["capped", "free"], services),
    }));
    expect(new Set([who(r, services[0].id, VOX), who(r, services[1].id, VOX)])).toEqual(new Set(["capped", "free"]));

    const only = planMonth(input({ services, people: [person("capped", { vox: 1 }, { maxPerMonth: 1 })], availability: all(["capped"], services) }));
    const second = only.slots.find((x) => x.serviceId === services[1].id)!;
    expect(second.personId).toBe("capped");
    expect(second.relaxed.join(" ")).toMatch(/monthly limit \(1\)/);
  });
});

describe("availability", () => {
  it("uses a yes before a maybe", () => {
    const s = svc(sundays[0], [AC]);
    const r = planMonth(input({
      services: [s],
      people: [person("maybe", { acoustic: 1 }), person("yes", { acoustic: 3 })],
      availability: [{ personId: "maybe", serviceId: s.id, response: "maybe" }, { personId: "yes", serviceId: s.id, response: "yes" }],
    }));
    expect(who(r, s.id, AC)).toBe("yes");
  });
});

describe("households", () => {
  it("puts household members on the same service when both are free", () => {
    const [a, b] = [svc(sundays[0], [LEAD, VOX]), svc(sundays[2], [LEAD, VOX])];
    const hh = { id: "h1", preference: "together" as const };
    const r = planMonth(input({
      services: [a, b],
      households: [hh],
      people: [
        person("husband", { lead: 1 }, { householdId: "h1" }),
        person("otherLead", { lead: 1 }),
        person("wife", { vox: 1 }, { householdId: "h1" }),
        person("otherVox", { vox: 1 }),
      ],
      availability: all(["husband", "otherLead", "wife", "otherVox"], [a, b]),
    }));
    for (const s of [a, b]) {
      const lead = who(r, s.id, LEAD);
      const vox = who(r, s.id, VOX);
      expect(lead === "husband").toBe(vox === "wife");
    }
  });

  it("rest week outranks households by default, and the order is editable", () => {
    // Wife served last Sunday; husband is leading today. Default order: rest week wins.
    const s = svc(sundays[1], [LEAD, VOX]);
    const base = input({
      services: [s],
      households: [{ id: "h1", preference: "together" }],
      people: [person("husband", { lead: 1 }, { householdId: "h1" }), person("wife", { vox: 1 }, { householdId: "h1" }), person("otherVox", { vox: 1 })],
      availability: all(["husband", "wife", "otherVox"], [s]),
      history: [{ personId: "wife", date: sundays[0] }],
      locks: [{ serviceId: s.id, roleId: LEAD, slotIndex: 0, personId: "husband" }],
    });
    expect(who(planMonth(base), s.id, VOX)).toBe("otherVox");
    const familyFirst = { ...base, rules: { ...base.rules, softOrder: ["monthly_cap", "households", "rest_gap", "availability", "fairness"] as typeof DEFAULT_SOFT_ORDER } };
    expect(who(planMonth(familyFirst), s.id, VOX)).toBe("wife");
  });

  it("keeps an 'apart' household on different services", () => {
    const s = svc(sundays[0], [LEAD, VOX]);
    const r = planMonth(input({
      services: [s],
      households: [{ id: "h1", preference: "apart" }],
      people: [person("a", { lead: 1 }, { householdId: "h1" }), person("b", { vox: 1 }, { householdId: "h1" }), person("c", { vox: 2 })],
      availability: all(["a", "b", "c"], [s]),
    }));
    expect(who(r, s.id, VOX)).toBe("c");
  });

  it("suggests households from shared surnames only, ignoring initials", () => {
    const groups = suggestHouseholds([
      { id: "1", name: "Dave Asplin", householdId: null },
      { id: "2", name: "Jo Asplin", householdId: null },
      { id: "3", name: "Tim D", householdId: null },
      { id: "4", name: "Sam D", householdId: null },
      { id: "5", name: "Baz", householdId: null },
    ]);
    expect(groups).toEqual([{ surname: "Asplin", personIds: ["1", "2"] }]);
  });
});

describe("locks, All-in and re-runs", () => {
  it("keeps locked slots and plans around them", () => {
    const services = sundays.slice(0, 2).map((d) => svc(d, [DRUMS]));
    const r = planMonth(input({
      services,
      people: [person("a", { drums: 1 }), person("b", { drums: 1 })],
      availability: all(["a", "b"], services),
      locks: [{ serviceId: services[1].id, roleId: DRUMS, slotIndex: 0, personId: "a" }],
    }));
    expect(who(r, services[1].id, DRUMS)).toBe("a");
    expect(r.slots.find((s) => s.serviceId === services[1].id)!.locked).toBe(true);
    expect(who(r, services[0].id, DRUMS)).toBe("b"); // 'a' is resting before their locked Sunday
  });

  it("staffs everyone who said yes on an All-in Sunday", () => {
    const s = svc(sundays[4], [LEAD, VOX], { isAllIn: true });
    const r = planMonth(input({
      services: [s],
      people: [person("l", { lead: 1 }), person("v1", { vox: 1 }), person("v2", { vox: 1 }), person("v3", { vox: 1 }), person("maybe", { vox: 1 })],
      availability: [...all(["l", "v1", "v2", "v3"], [s]), { personId: "maybe", serviceId: s.id, response: "maybe" }],
    }));
    const serving = r.slots.filter((x) => x.personId).map((x) => x.personId).sort();
    expect(serving).toEqual(["l", "v1", "v2", "v3"]);
    expect(r.slots.filter((x) => x.extra)).toHaveLength(2);
  });

  it("is deterministic", () => {
    const services = sundays.map((d) => svc(d, [LEAD, DRUMS, SOUND, KEYS, VOX, BASS]));
    const people = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id, i) =>
      person(id, { [[LEAD, DRUMS, SOUND, KEYS, VOX, BASS][i % 6]]: 1, [VOX]: 2 })
    );
    const inp = input({ services, people, availability: all(people.map((p) => p.id), services) });
    expect(planMonth(inp)).toEqual(planMonth(inp));
  });

  it("only plans the roles it is told to", () => {
    const s = svc(sundays[0], [LEAD, "slides"]);
    const r = planMonth(input({
      services: [s],
      people: [person("l", { lead: 1 }), person("p", { slides: 1 })],
      availability: all(["l", "p"], [s]),
      rules: { plannedRoleIds: [LEAD], coreGroups: [], allIn: true, softOrder: DEFAULT_SOFT_ORDER, restGapWeeks: 1, defaultMaxPerMonth: null },
    }));
    expect(r.slots.map((x) => x.roleId)).toEqual([LEAD]);
  });
});

describe("checkPlan (manual edits)", () => {
  it("flags hard breaks as block and soft breaks as warn", () => {
    const services = sundays.slice(0, 2).map((d) => svc(d, [DRUMS, KEYS]));
    const inp = input({
      services,
      people: [person("a", { drums: 1 })],
      availability: [{ personId: "a", serviceId: services[0].id, response: "yes" }, { personId: "a", serviceId: services[1].id, response: "no" }],
    });
    const w = checkPlan(inp, [
      { serviceId: services[0].id, roleId: KEYS, slotIndex: 0, personId: "a", locked: false, extra: false, reasons: [], relaxed: [] },
      { serviceId: services[1].id, roleId: DRUMS, slotIndex: 0, personId: "a", locked: false, extra: false, reasons: [], relaxed: [] },
    ]);
    expect(w.filter((x) => x.level === "block").map((x) => x.text)).toEqual(
      expect.arrayContaining(["a isn't listed for Keys", "a said no for this date"])
    );
    expect(w.some((x) => x.level === "warn" && /within 1 week/.test(x.text))).toBe(true);
  });
});
