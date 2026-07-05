// Scheduling engine contract types — Agent 1 contract artifact (PRD §18.2).
// The engine is pure and unit-testable (PRD §13): no Supabase imports here.

export type AvailabilityResponse = "yes" | "no" | "maybe";
export type Proficiency = "trainee" | "competent" | "lead";
export type PeriodType = "week" | "month";

export interface EngineVolunteer {
  profileId: string;
  name: string;
  /** roleId -> proficiency for every role this volunteer is eligible for */
  eligibleRoles: Record<string, Proficiency>;
  /** roleId -> the volunteer's stated instrument preference rank (1 = first
      choice). Missing entries default to 1. Lower = preferred. */
  rolePreferenceRank?: Record<string, number>;
}

export interface EngineAvailability {
  profileId: string;
  response: AvailabilityResponse;
}

export interface EngineBlockout {
  profileId: string;
  startDate: string | null; // ISO date
  endDate: string | null;
  recurringDayOfWeek: number | null; // 0=Sunday..6=Saturday
}

/** One past confirmed serve, used for fairness recency + soft-cap counting */
export interface EngineHistoryEntry {
  profileId: string;
  roleId: string;
  serviceDate: string; // ISO date
}

export interface EnginePreference {
  profileId: string;
  maxServicesPerPeriod: number | null;
  periodType: PeriodType;
}

export interface EngineSlot {
  roleId: string;
  roleName: string;
  slotIndex: number; // 0..quantity_required-1
}

export interface EngineServiceInput {
  serviceDate: string; // ISO date
  slots: EngineSlot[];
  volunteers: EngineVolunteer[];
  availability: EngineAvailability[];
  blockouts: EngineBlockout[];
  history: EngineHistoryEntry[];
  preferences: EnginePreference[];
  /** assignments already made this period (incl. other services), for soft-cap counting */
  periodAssignments: EngineHistoryEntry[];
}

export interface Suggestion {
  roleId: string;
  slotIndex: number;
  profileId: string | null; // null = no suitable candidate
  reasons: string[];
  /** true when volunteer has met/exceeded their stated preference cap (SCHED-7) —
      suggested only if no under-cap candidate exists, and clearly flagged */
  overPreferenceCap: boolean;
}

export interface CandidateScore {
  profileId: string;
  name: string;
  score: number;
  overPreferenceCap: boolean;
  reasons: string[];
}

export interface ClashInput {
  serviceDate: string;
  startTime: string; // "HH:MM"
  endTime: string | null;
}
