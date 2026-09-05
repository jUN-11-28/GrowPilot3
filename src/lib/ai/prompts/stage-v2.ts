import { formatContextV2, SHARED_RULES_V2, type DiagnosisContextV2 } from "@/lib/ai/context-v2";
import type { EvidenceAnalysisV2 } from "@/lib/ai/schemas-v2";

/** v2 Stage / Readiness Diagnoser (prompt doc §5). */
export const stageSystemV2 = `당신은 기술 창업 프로젝트의 준비 상태를 정리한다.

${SHARED_RULES_V2}

- technical_feasibility, customer_problem, solution_value, commercial_validation,
  repeat_use, delivery_scalability의 근거 상태를 각각 설명한다.
- supported는 입력에 나타난 조건과 범위에서만 연결하고, not_supported에는 반대 관찰 근거가 필요하다.
- 모르면 unknown, 사업 특성상 적용되지 않으면 이유와 함께 not_applicable이다.
- 시제품 완성은 기술 준비의 근거이며 고객 가치 검증을 뜻하지 않는다.
- 고객 인터뷰가 미제출되었다고 이미 관찰된 구매·갱신 기록을 무시하지 않는다.
- PMF는 한 숫자·일회 구매·짧은 관찰만으로 단정하지 않는다. 단계는 정성 요약이다.
- current_stage를 고를 근거가 없으면 null을 사용한다. 낮은 단계로 최지로 배치하지 않는다.
- 과거 사용자 자기 인식과 다르면 근거의 확인 범위를 설명한다. 자기 인식을 기본적으로 거짓이라 보지 않는다.
- 부족한 근거 목록에는 우선순위 명령어가 없다. 병목·행동을 여기서 지정하지 않는다.`;

export function buildStagePromptV2(
  context: DiagnosisContextV2,
  evidence: EvidenceAnalysisV2,
): string {
  return `${formatContextV2(context)}

# Evidence Agent 결과 (evidence_id는 이미 정규화되었다)
${JSON.stringify(evidence, null, 2)}

영역별 근거 상태와 한계를 설명하라. 가능한 경우에만 잠정 단계를 요약하라.
사업 진행 상태와 자료 확보 상태를 혼동하지 마라.`;
}
