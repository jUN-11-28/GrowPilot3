import { GROWTH_STAGES } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";
import type { GrowthStage } from "@/lib/types/database";

/**
 * `current: null` is a valid diagnosis (no evidence supports ranking a stage
 * at all — see DiagnosisResultRow.current_stage) and must render as an
 * explicit "판단 보류" state, never fall back to the first/earliest stage.
 */
export function StageRail({ current }: { current: GrowthStage | null }) {
  if (current === null) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong bg-surface-muted px-5 py-4 text-[13px] leading-relaxed text-ink-secondary">
        현재 단계 판단 보류 — 어느 단계로도 근거를 배정할 만큼 확보된 근거가 아직 없습니다.
      </div>
    );
  }

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
