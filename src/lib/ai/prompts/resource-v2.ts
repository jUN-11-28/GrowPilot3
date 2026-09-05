import { formatProjectV2, SHARED_RULES_V2, type DiagnosisContextV2 } from "@/lib/ai/context-v2";
import type { SynthesisV2 } from "@/lib/ai/schemas-v2";
import { RESOURCE_TYPE_LABEL } from "@/lib/domain/constants";
import { inferDisplayAvailability, RESOURCE_AVAILABILITY_LABEL } from "@/lib/domain/resource-display";
import type { ResourceRow } from "@/lib/types/database";

/**
 * v2 Resource Agent (prompt doc §9) — model-output half only. `lookup_status
 * = failed` short-circuits before this prompt is ever built (the server
 * returns that state without a model call); see schemas-v2.ts's comment on
 * ResourceSelectionV2Schema.
 */
export const resourceSystemV2 = `당신은 확정된 다음 행동을 실행하는 데 필요한 자원만 고른다. 다시 진단하지 않는다.

${SHARED_RULES_V2}

- 이 행동의 각 단계에서 어떤 도움이 필요한지 먼저 설명한다.
- 기술 유형과 시간·예산·지역·접근 조건을 함께 고려한다. 창업자의 직군만으로 추천하지 않는다.
- 후보가 태그 검색인지 확대 검색인지 확인한다. 후보가 적다는 이유로 무리해 맞다고 하지 않는다.
- 후보 목록의 번호만 고르고 전체 0~5개를 선택한다. 개수를 채우려 하지 않는다.
- 출처에 없는 URL·신청 조건·가격을 만들거나 확인했다고 쓰지 않는다.
- 제공된 조건으로 지금 사용 가능함이 확인된 자원만 available로 정리한다.
- 도움 자체가 불필요한 경우만 not_needed이며 그 이유를 남긴다.
- 도움이 필요한데 맞는 후보가 없으면 no_match다.
- 접근·가격·신청 조건 확인이 남았거나 설명만 있는 자료는 needs_verification으로 표시한다.
- 후보 목록에 이미 표시된 분류(참고 자료/이용 조건 확인 필요/바로 활용 가능)와 확인 시각을 그대로 신뢰하되,
  확인 시각이 없는 자료를 최신 조건이 확인된 것처럼 쓰지 않는다.
- 각 선택에 연결되는 실행 단계와 확인할 조건을 설명한다.
- 참고 전용 자료를 다운로드 가능한 템플릿이나 전문가 연결로 소개하지 않는다.`;

export function buildResourcePromptV2(
  context: DiagnosisContextV2,
  synthesis: SynthesisV2,
  candidates: ResourceRow[],
): string {
  const catalogue = candidates
    .map((resource, index) => {
      const availability = RESOURCE_AVAILABILITY_LABEL[inferDisplayAvailability(resource)];
      const cost = resource.cost_info ? ` [비용: ${JSON.stringify(resource.cost_info)}]` : "";
      const eligibility = resource.eligibility ? ` [신청 조건: ${resource.eligibility}]` : "";
      const verified = resource.last_verified_at ? ` [최종 확인: ${resource.last_verified_at}]` : " [확인 시각 미상]";
      return `${index + 1}. (${RESOURCE_TYPE_LABEL[resource.resource_type]} · ${availability}) ${resource.title} — ${resource.description} [bottleneck: ${resource.bottleneck_tags.join("/")}]${cost}${eligibility}${verified}`;
    })
    .join("\n");

  return `${formatProjectV2(context)}

# 확정된 다음 행동
${synthesis.critical_bottleneck}
이유: ${synthesis.bottleneck_reason}
${JSON.stringify(synthesis.next_experiment, null, 2)}

# 후보 자원 목록 (이미 태그로 한 차례 좁혀졌다)
${catalogue || "(없음)"}

이 행동을 실행하는 데 필요한 자원을 고르라. 맞는 것이 없으면 그 상태를 그대로 반환하라.`;
}
