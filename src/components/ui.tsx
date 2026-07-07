// Shared UI primitives — themed per design-tokens.json, not default anything (§10.6).
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Loader2 } from "lucide-react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card p-4 sm:p-5 ${className}`}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  action,
  back,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** true = browser back; a string = navigate to that route */
  back?: boolean | string;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div className="flex items-start gap-1.5 min-w-0">
        {back && (
          <button
            className="btn-ghost !min-h-[40px] px-1.5 -ml-2 mt-0.5 shrink-0"
            aria-label="Back"
            onClick={() => (typeof back === "string" ? navigate(back) : navigate(-1))}
          >
            <ChevronLeft size={22} />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-soft text-sm mt-1">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

const badgeTones: Record<string, string> = {
  neutral: "bg-raised text-soft",
  accent: "bg-accent-soft text-accent-strong",
  info: "bg-info-soft text-info",
  positive: "bg-positive-soft text-positive",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return <span className={`chip ${badgeTones[tone]}`}>{children}</span>;
}

export function statusBadgeTone(status: string): keyof typeof badgeTones {
  switch (status) {
    case "published":
    case "confirmed":
    case "approved":
    case "yes":
      return "positive";
    case "availability_open":
    case "scheduling_open":
    case "invited":
    case "claimed":
    case "maybe":
      return "info";
    case "needs_substitute":
    case "declined":
    case "cancelled":
    case "no":
      return "danger";
    case "draft":
    case "open":
      return "warning";
    default:
      return "neutral";
  }
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 text-soft py-12" role="status" aria-label={label}>
      <Loader2 className="animate-spin" size={20} aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

/** Designed empty state — a screen with its own copy, not a blank div (§10.3) */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center text-center px-6 py-12 gap-3">
      {icon && <div className="text-faint [&>svg]:w-10 [&>svg]:h-10">{icon}</div>}
      <h3 className="font-display font-bold text-lg">{title}</h3>
      {body && <p className="text-soft text-sm max-w-sm">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="card border-danger/30 bg-danger-soft/40 px-6 py-8 text-center">
      <h3 className="font-display font-bold text-danger mb-1">Something went wrong</h3>
      <p className="text-soft text-sm">{message}</p>
      {retry && (
        <button className="btn-secondary mt-4" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-faint mt-1">{hint}</span>}
    </label>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-brand-ink/50 p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="bg-surface w-full sm:max-w-lg rounded-t-lg sm:rounded-lg shadow-raised max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="font-display font-bold text-lg">{title}</h2>
          <button className="btn-ghost !min-h-[36px] px-2 text-xl leading-none" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="px-5 pb-6">{children}</div>
      </div>
    </div>
  );
}
