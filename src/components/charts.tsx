// Tiny chart primitives — glass-friendly, dependency-free, clickable.
import type { ReactNode } from "react";

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  sublabel?: string;
}

/** Vertical bars (e.g. months). Click a bar to select it. */
export function ColumnChart({
  data,
  selected,
  onSelect,
  height = 120,
}: {
  data: BarDatum[];
  selected?: string | null;
  onSelect?: (key: string) => void;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-1.5 w-full" style={{ height }} role="img" aria-label="Bar chart">
      {data.map((d) => (
        <button
          key={d.key}
          className="flex-1 flex flex-col items-center justify-end h-full min-w-0 group"
          onClick={() => onSelect?.(d.key)}
          aria-label={`${d.label}: ${d.value}`}
        >
          <span className="text-[10px] font-bold text-soft mb-0.5">{d.value > 0 ? d.value : ""}</span>
          <span
            className={`w-full rounded-t-md transition-all ${
              selected === d.key
                ? "bg-brand-gradient"
                : "bg-accent/40 group-hover:bg-accent/70"
            }`}
            style={{ height: `${Math.max(d.value === 0 ? 2 : 8, (d.value / max) * 75)}%` }}
          />
          <span className={`text-[9px] mt-1 truncate w-full text-center ${selected === d.key ? "text-accent-strong font-bold" : "text-faint"}`}>
            {d.label}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Horizontal bars (e.g. top songs, role split). Click a row to select. */
export function BarList({
  data,
  selected,
  onSelect,
  suffix = "",
}: {
  data: BarDatum[];
  selected?: string | null;
  onSelect?: (key: string) => void;
  suffix?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-1.5">
      {data.map((d) => (
        <li key={d.key}>
          <button
            className="w-full text-left group min-h-[36px]"
            onClick={() => onSelect?.(d.key)}
            aria-label={`${d.label}: ${d.value}${suffix}`}
          >
            <div className="flex justify-between text-xs mb-0.5 gap-2">
              <span className={`truncate ${selected === d.key ? "font-bold text-accent-strong" : "font-semibold"}`}>
                {d.label}
                {d.sublabel && <span className="text-faint font-normal"> · {d.sublabel}</span>}
              </span>
              <span className="text-soft shrink-0 font-semibold">
                {d.value}
                {suffix}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-raised overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  selected === d.key ? "bg-brand-gradient" : "bg-accent/50 group-hover:bg-accent/80"
                }`}
                style={{ width: `${(d.value / max) * 100}%` }}
              />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function ChartCard({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="card p-4 sm:p-5">
      <h2 className="font-display font-bold">{title}</h2>
      {sub && <p className="text-soft text-xs mb-3">{sub}</p>}
      {!sub && <div className="mb-3" />}
      {children}
    </div>
  );
}
