import { GROWTH_STAGE_ORDER, GROWTH_STAGE_LABEL } from "@/lib/domain/constants";
import type { StageDiagnosis } from "@/lib/ai/schemas";
import type { GrowthStage } from "@/lib/types/database";

export function stageIndex(stage: GrowthStage): number {
  return GROWTH_STAGE_ORDER.indexOf(stage);
}

/**
 * The stage-precedence rule, applied in code rather than left to the prompt:
 * the earliest stage with an unmet prerequisite outranks the diagnosed stage as
 * a bottleneck candidate.
 */
export function earliestUnmetStage(
  diagnosis: StageDiagnosis,
): { stage: GrowthStage; missing: string } | null {
  if (diagnosis.unmet_prerequisites.length === 0) return null;

  return [...diagnosis.unmet_prerequisites].sort(
    (a, b) => stageIndex(a.stage) - stageIndex(b.stage),
  )[0];
}

export function buildPriorityHint(diagnosis: StageDiagnosis): string {
  const unmet = earliestUnmetStage(diagnosis);
  if (!unmet) {
    return `선행 단계에서 비어 있는 전제는 보고되지 않았다. 현재 단계(${GROWTH_STAGE_LABEL[diagnosis.current_stage]})에서 다음 단계로 넘어가지 못하게 막는 것을 찾아라.`;
  }

  const isEarlier = stageIndex(unmet.stage) < stageIndex(diagnosis.current_stage);
  if (!isEarlier) {
    return `현재 단계(${GROWTH_STAGE_LABEL[diagnosis.current_stage]})에서 "${unmet.missing}"이(가) 아직 채워지지 않았다. 이를 최우선 후보로 검토하라.`;
  }

  return `선행 단계 ${GROWTH_STAGE_LABEL[unmet.stage]}의 전제가 아직 채워지지 않았다: "${unmet.missing}".
따라서 현재 단계(${GROWTH_STAGE_LABEL[diagnosis.current_stage]})의 문제보다 ${GROWTH_STAGE_LABEL[unmet.stage]} 단계의 미검증 가설을 우선 병목 후보로 삼아야 한다.
이 규칙을 뒤집으려면 그럴 만한 근거를 reason에 명시하라.`;
}
