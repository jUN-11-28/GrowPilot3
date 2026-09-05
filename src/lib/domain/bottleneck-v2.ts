import { READINESS_DIMENSION_LABEL_V2 } from "@/lib/domain/constants";
import type { ReadinessItemV2, StageDiagnosisV2 } from "@/lib/ai/schemas-v2";
import type { ExecutionConstraints } from "@/lib/types/database";

/**
 * v2 replacement for v1's `buildPriorityHint`/`earliestUnmetStage`
 * (domain/bottleneck.ts), which hard-codes "the earliest stage with an unmet
 * prerequisite always outranks the others." Prompt doc §2.A explicitly
 * forbids that rule for v2: readiness gaps are reported as a list for the
 * Bottleneck Analyst to weigh against impact/urgency/dependency/feasibility
 * (and now execution constraints), not pre-ranked by dimension order.
 *
 * v1's `buildPriorityHint` is untouched and still used by the v1 pipeline —
 * this is a separate function, not a rewrite of it.
 */
export function buildPriorityHintV2(
  stage: StageDiagnosisV2,
  constraints: ExecutionConstraints | null,
): string {
  const gaps = stage.readiness.filter(
    (item): item is ReadinessItemV2 => item.status === "not_supported" || item.status === "unknown",
  );

  const gapLines =
    gaps.length === 0
      ? "모든 영역이 supported/partial/not_applicable로 판정되어, 코드가 특정 영역을 강제로 우선순위에 올리지 않는다."
      : gaps
          .map(
            (item) =>
              `- ${READINESS_DIMENSION_LABEL_V2[item.dimension]} (${item.status}): ${item.missing_information.join("; ") || "구체적 누락 사항 미기재"}`,
          )
          .join("\n");

  const constraintLines = constraints
    ? [
        constraints.hours_per_week !== null
          ? `- 주당 투입 가능 시간: ${constraints.hours_per_week}시간`
          : null,
        constraints.budget_amount !== null
          ? `- 예산: ${constraints.budget_amount}${constraints.budget_currency ?? ""}`
          : null,
        constraints.hard_constraints.length > 0
          ? `- 고정 제약: ${constraints.hard_constraints.join("; ")}`
          : null,
      ]
        .filter((line): line is string => line !== null)
        .join("\n") || "(추가로 알려진 제약 없음)"
    : "(실행 여건이 입력되지 않음 — 모두 모름)";

  return `# 근거 상태가 비어 있거나 반대 근거가 있는 영역
${gapLines}

# 창업자의 실행 여건
${constraintLines}

이 목록은 순위가 아니라 후보 재료다. 어느 영역의 공백이 가장 시급한 병목인지는
영향(impact)·시급성(urgency)·다른 결정과의 선후관계(dependency)·지금 확인 가능한지(feasibility)를
비교해 판단하라. "가장 이른 영역"이라는 이유만으로 자동으로 최우선 후보가 되지 않는다.`;
}
