import { cn } from "@/lib/utils";

function tone(value: number) {
  if (value >= 67) return "bg-positive";
  if (value >= 34) return "bg-ink";
  return "bg-critical";
}

export function ConfidenceMeter({
  label,
  value,
  caption,
}: {
  label: string;
  value: number;
  caption: string;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-ink">{label}</span>
        <span className="text-[15px] font-semibold tabular-nums text-ink">{value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className={cn("h-full rounded-full", tone(value))}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <p className="text-xs leading-relaxed text-ink-secondary">{caption}</p>
    </div>
  );
}
