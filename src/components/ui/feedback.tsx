import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Alert({
  tone = "danger",
  title,
  children,
  className,
}: {
  tone?: "danger" | "info";
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-4 py-3 text-[13px] leading-relaxed",
        tone === "danger"
          ? "border-danger/20 bg-danger-soft text-danger"
          : "border-line bg-surface-muted text-ink-secondary",
        className,
      )}
    >
      {title ? <p className="font-medium">{title}</p> : null}
      {children}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle aria-hidden className={cn("size-4 animate-spin", className)} />;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface-muted px-6 py-16 text-center">
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      <p className="max-w-sm text-[13px] leading-relaxed text-ink-secondary">
        {description}
      </p>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number;
  label?: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={cn("space-y-2", className)}>
      {label ? (
        <div className="flex items-center justify-between text-xs text-ink-muted">
          <span>{label}</span>
          <span className="tabular-nums">
            {value} / {max}
          </span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        className="h-1 w-full overflow-hidden rounded-full bg-line"
      >
        <div
          className="h-full rounded-full bg-ink transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
