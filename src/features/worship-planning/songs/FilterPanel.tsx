// Full filter set for the song library. Pure UI over SongFilters.
import type { ReactNode } from "react";
import {
  KEY_ORDER,
  MISSING_LABEL,
  ROTATION_LABEL,
  TEMPO_LABEL,
  type KeyField,
  type Missing,
  type Rotation,
  type SongFilters,
  type Tempo,
} from "./songModel";

function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T[] | undefined;
  onChange: (v: T[] | undefined) => void;
  label: (o: { value: T; label: string }) => ReactNode;
}) {
  const cur = value ?? [];
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = cur.includes(o.value);
        return (
          <button
            type="button"
            key={o.value}
            aria-pressed={on}
            className={`chip min-h-[36px] ${on ? "bg-accent text-white dark:text-brand-ink" : "bg-raised text-soft"}`}
            onClick={() => {
              const next = on ? cur.filter((x) => x !== o.value) : [...cur, o.value];
              onChange(next.length ? next : undefined);
            }}
          >
            {label(o)}
          </button>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-wide text-faint mb-1.5">{title}</h3>
      {children}
    </section>
  );
}

const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

export default function FilterPanel({
  filters,
  onChange,
  tagNames,
  topArtists,
}: {
  filters: SongFilters;
  onChange: (f: SongFilters) => void;
  tagNames: string[];
  topArtists: string[];
}) {
  const set = <K extends keyof SongFilters>(k: K, v: SongFilters[K]) => {
    const next = { ...filters, [k]: v };
    if (v === undefined || (Array.isArray(v) && v.length === 0)) delete next[k];
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <Section title="Key">
        <Chips
          options={KEY_ORDER.map((k) => ({ value: k, label: k }))}
          value={filters.keys}
          onChange={(v) => set("keys", v)}
          label={(o) => o.label}
        />
        <div className="flex flex-wrap gap-1.5 mt-2" role="radiogroup" aria-label="Which key to match">
          {(["any", "female", "male", "played"] as KeyField[]).map((k) => (
            <button
              type="button"
              key={k}
              role="radio"
              aria-checked={(filters.keyField ?? "any") === k}
              className={`chip min-h-[32px] ${(filters.keyField ?? "any") === k ? "bg-info-soft text-info" : "bg-raised text-faint"}`}
              onClick={() => set("keyField", k === "any" ? undefined : k)}
            >
              {k === "any" ? "Any key field" : k === "played" ? "Key we've played it in" : `${k[0].toUpperCase()}${k.slice(1)} key`}
            </button>
          ))}
        </div>
        {!!filters.keys?.length && (
          <label className="flex items-center gap-2 text-sm mt-2 min-h-[40px]">
            <input type="checkbox" className="w-5 h-5" checked={!!filters.closeKeys} onChange={(e) => set("closeKeys", e.target.checked || undefined)} />
            Include close keys <span className="text-faint">(a 4th or 5th up, relative minor/major)</span>
          </label>
        )}
      </Section>

      <Section title="Tempo">
        <Chips
          options={(Object.keys(TEMPO_LABEL) as Tempo[]).map((t) => ({ value: t, label: TEMPO_LABEL[t] }))}
          value={filters.tempos}
          onChange={(v) => set("tempos", v)}
          label={(o) => o.label}
        />
        <div className="flex items-center gap-2 mt-2">
          <input
            className="input !min-h-[40px] w-24"
            type="number"
            inputMode="numeric"
            placeholder="Min"
            aria-label="Minimum BPM"
            value={filters.bpmMin ?? ""}
            onChange={(e) => set("bpmMin", num(e.target.value))}
          />
          <span className="text-faint text-sm">to</span>
          <input
            className="input !min-h-[40px] w-24"
            type="number"
            inputMode="numeric"
            placeholder="Max"
            aria-label="Maximum BPM"
            value={filters.bpmMax ?? ""}
            onChange={(e) => set("bpmMax", num(e.target.value))}
          />
          <span className="text-faint text-sm">bpm</span>
        </div>
      </Section>

      <Section title="Time signature">
        <Chips
          options={["4/4", "6/8", "3/4", "12/8"].map((t) => ({ value: t, label: t }))}
          value={filters.timeSigs}
          onChange={(v) => set("timeSigs", v)}
          label={(o) => o.label}
        />
        <label className="flex items-center gap-2 text-sm mt-2">
          <input type="checkbox" className="w-5 h-5" checked={filters.swung === true} onChange={(e) => set("swung", e.target.checked ? true : undefined)} />
          Swung songs only
        </label>
      </Section>

      <Section title="Artist">
        <Chips options={topArtists.map((a) => ({ value: a, label: a }))} value={filters.artists} onChange={(v) => set("artists", v)} label={(o) => o.label} />
        <input
          className="input !min-h-[40px] mt-2"
          placeholder="Or type part of a name, e.g. Hillsong"
          value={(filters.artists ?? []).filter((a) => !topArtists.includes(a)).join(", ")}
          onChange={(e) => {
            const typed = e.target.value.split(",").map((x) => x.trim()).filter(Boolean);
            const chips = (filters.artists ?? []).filter((a) => topArtists.includes(a));
            set("artists", [...chips, ...typed].length ? [...chips, ...typed] : undefined);
          }}
        />
      </Section>

      <Section title="Tags">
        <Chips options={tagNames.map((t) => ({ value: t, label: t }))} value={filters.tags} onChange={(v) => set("tags", v)} label={(o) => o.label} />
        {(filters.tags?.length ?? 0) > 1 && (
          <label className="flex items-center gap-2 text-sm mt-2">
            <input type="checkbox" className="w-5 h-5" checked={filters.tagMode === "all"} onChange={(e) => set("tagMode", e.target.checked ? "all" : undefined)} />
            Must have all selected tags
          </label>
        )}
      </Section>

      <Section title="When we last sang it">
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "Not in 3+ months", v: { notSungMonths: 3 } },
            { label: "Not in 6+ months", v: { notSungMonths: 6 } },
            { label: "Not in a year+", v: { notSungMonths: 12 } },
            { label: "Sung in last 3 months", v: { sungWithinMonths: 3 } },
          ].map((o) => {
            const on =
              (o.v.notSungMonths != null && filters.notSungMonths === o.v.notSungMonths) ||
              (o.v.sungWithinMonths != null && filters.sungWithinMonths === o.v.sungWithinMonths);
            return (
              <button
                type="button"
                key={o.label}
                aria-pressed={on}
                className={`chip min-h-[36px] ${on ? "bg-accent text-white dark:text-brand-ink" : "bg-raised text-soft"}`}
                onClick={() => {
                  const next = { ...filters };
                  delete next.notSungMonths;
                  delete next.sungWithinMonths;
                  onChange(on ? next : { ...next, ...o.v });
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-sm text-soft">Sung at least</span>
          <input
            className="input !min-h-[40px] w-20"
            type="number"
            inputMode="numeric"
            min={0}
            aria-label="Minimum times sung"
            value={filters.minTimesSung ?? ""}
            onChange={(e) => set("minTimesSung", num(e.target.value))}
          />
          <span className="text-sm text-soft">times</span>
        </div>
      </Section>

      <Section title="Rotation">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(ROTATION_LABEL) as Rotation[]).map((r) => (
            <button
              type="button"
              key={r}
              aria-pressed={filters.rotation === r}
              className={`chip min-h-[36px] ${filters.rotation === r ? "bg-accent text-white dark:text-brand-ink" : "bg-raised text-soft"}`}
              onClick={() => set("rotation", filters.rotation === r ? undefined : r)}
            >
              {ROTATION_LABEL[r]}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Gaps to fill">
        <Chips
          options={(Object.keys(MISSING_LABEL) as Missing[]).map((m) => ({ value: m, label: MISSING_LABEL[m] }))}
          value={filters.missing}
          onChange={(v) => set("missing", v)}
          label={(o) => o.label}
        />
        <label className="flex items-center gap-2 text-sm mt-2">
          <input type="checkbox" className="w-5 h-5" checked={!!filters.needsChecking} onChange={(e) => set("needsChecking", e.target.checked || undefined)} />
          Has something in Needs checking
        </label>
      </Section>

      <Section title="Show">
        <div className="flex gap-1.5">
          {(["active", "archived", "all"] as const).map((s) => (
            <button
              type="button"
              key={s}
              aria-pressed={(filters.status ?? "active") === s}
              className={`chip min-h-[36px] ${(filters.status ?? "active") === s ? "bg-accent text-white dark:text-brand-ink" : "bg-raised text-soft"}`}
              onClick={() => set("status", s === "active" ? undefined : s)}
            >
              {s === "active" ? "Active songs" : s === "archived" ? "Archived" : "Everything"}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}
