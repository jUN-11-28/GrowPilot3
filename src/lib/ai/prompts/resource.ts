import { formatProject, SHARED_RULES, type DiagnosisContext } from "@/lib/ai/context";
import type { Synthesis } from "@/lib/ai/schemas";
import { EXPERIMENT_DURATION_DAYS, RESOURCE_TYPE_LABEL } from "@/lib/domain/constants";
import type { ResourceRow } from "@/lib/types/database";

export const resourceSystem = `당신은 Resource Agent다.
이미 확정된 병목과 ${EXPERIMENT_DURATION_DAYS}일 미션을 받아, 그것을 실행하는 데 필요한 자원만 고른다.

${SHARED_RULES}

# 역할 규칙
- 병목은 이미 확정되었다. 다시 진단하지 않고, 병목을 바꾸지도 않는다.
- 순서대로 생각한다: 확정된 병목 → 이를 풀기 위한 전략 → 그 전략에 필요한 자원.
  strategy에 그 전략을 한 문장으로 쓴다. 자원은 반드시 이 전략에서 도출되어야 한다.
- 창업자의 유형("개발자니까 마케팅 툴")으로 고르지 않는다. 진단된 병목으로만 고른다.
- 실험의 method를 그대로 실행한다고 상상하고, 1인 창업자가 혼자서는 막히는 지점을 메우는 것만 고른다.
- reason에는 "이번 실험의 어느 지점에서 왜 필요한가"를 쓴다. 일반적으로 좋은 자료라는 이유는 근거가 아니다.
- 이번 실험에 쓰이지 않으면 넣지 않는다. 통틀어 최대 5개. 필요 없으면 빈 배열로 둔다.
- 후보 목록에 없는 번호는 절대 만들지 않는다.`;

export function buildResourcePrompt(
  context: DiagnosisContext,
  synthesis: Synthesis,
  candidates: ResourceRow[],
): string {
  const catalogue = candidates
    .map(
      (resource, index) =>
        `${index + 1}. (${RESOURCE_TYPE_LABEL[resource.resource_type]}) ${resource.title} — ${resource.description} [stage: ${resource.stage_tags.join("/")}] [bottleneck: ${resource.bottleneck_tags.join("/")}]`,
    )
    .join("\n");

  return `${formatProject(context)}

# 확정된 병목
${synthesis.critical_bottleneck}

이유: ${synthesis.bottleneck_reason}
검증 공백: ${synthesis.evidence_gap}
병목 태그: ${synthesis.bottleneck_tags.join(", ") || "(없음)"}

# 확정된 ${EXPERIMENT_DURATION_DAYS}일 미션
${JSON.stringify(synthesis.next_experiment, null, 2)}

# 후보 자원 목록 (병목 태그로 이미 한 차례 좁혀진 목록이다)
${catalogue || "(없음)"}

이 실험을 실행하는 데 필요한 자원을 고르라.`;
}
