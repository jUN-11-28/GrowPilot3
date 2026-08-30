import { GROWTH_STAGES } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";
import type { GrowthStage } from "@/lib/types/database";

export function StageRail({ current }: { current: GrowthStage }) {
  const currentIndex = GROWTH_STAGES.findIndex((s) => s.value === current);

  return (
    <ol className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-5">
      {GROWTH_STAGES.map((stage, index) => {
        const isCurrent = index === currentIndex;
        const isPast = index < currentIndex;
        return (
          <li
            key={stage.value}
            className={cn(
              "space-y-2 px-4 py-4",
              isCurrent ? "bg-ink text-ink-inverse" : "bg-surface",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "text-[11px] tabular-nums",
                  isCurrent ? "text-ink-inverse/60" : "text-ink-muted",
                )}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              {isCurrent ? (
                <span className="text-[10px] font-medium uppercase tracking-wider text-ink-inverse/80">
                  현재
                </span>
              ) : null}
            </div>
            <p
              className={cn(
                "text-[13px] font-semibold",
                isCurrent ? "text-ink-inverse" : isPast ? "text-ink" : "text-ink-muted",
              )}
            >
              {stage.label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
