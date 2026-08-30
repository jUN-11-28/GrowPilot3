import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "critical" | "positive" | "muted";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-muted text-ink-secondary border-line",
  accent: "bg-accent-soft text-accent border-accent/20",
  critical: "bg-critical-soft text-critical border-critical-line",
  positive: "bg-positive-soft text-positive border-positive/20",
  muted: "bg-transparent text-ink-muted border-line",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
