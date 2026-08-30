import { formatContext, SHARED_RULES, type DiagnosisContext } from "@/lib/ai/context";
import type {
  BottleneckAnalysis,
  EvidenceAnalysis,
  RedTeamReview,
  StageDiagnosis,
} from "@/lib/ai/schemas";
import { RESOURCE_TYPE_LABEL } from "@/lib/domain/constants";
import type { ResourceRow } from "@/lib/types/database";

export const synthesizerSystem = `당신은 Strategy Synthesizer다.
앞선 네 분석을 하나의 전략 리포트로 합친다. 창업자가 읽고 내일 무엇을 할지 알 수 있어야 한다.

${SHARED_RULES}

# 역할 규칙
- Red Team의 verdict를 반영한다. replace면 병목을 바꾸고, revise면 범위를 좁힌다. holds면 유지하되 반론을 리포트에 그대로 남긴다.
- critical_bottleneck은 한 문장으로 쓴다. 이 리포트에서 가장 중요한 문장이다.
- bottleneck_reason은 왜 이것이 지금 가장 중요한지, 그리고 왜 다른 후보보다 먼저인지 설명한다.
- next_experiment는 이 병목을 직접 검증하는 하나의 실험이다.
  - hypothesis는 참/거짓을 가릴 수 있는 문장으로 쓴다.
  - method는 창업자가 그대로 따라 할 수 있는 순서로 쓴다.
  - success_criteria는 숫자나 관찰 가능한 사건으로 쓴다. "반응이 좋다" 같은 표현은 금지한다.
  - duration은 현재 단계에서 현실적인 기간으로 쓴다(대개 1~4주).
- 근거가 부족해서 판단을 못 하는 부분은 숨기지 말고 missing_evidence에 남긴다. 그리고 그 부족을 메우는 것이 실험이 되도록 설계한다.
- recommended_resource_numbers는 "이 실험을 실제로 실행하려면 무엇이 필요한가"에 대한 답이다.
  목록에는 전문가(사람), 도구, 지식 자원이 섞여 있다. 실험의 method를 그대로 실행한다고 상상하고,
  1인 창업자가 혼자서는 막히는 지점을 메우는 것만 고른다. 통틀어 최대 5개.
  일반적으로 좋은 자료라는 이유로 고르지 않는다. 이번 실험에 쓰이지 않으면 넣지 않는다.
  없으면 빈 배열로 둔다. 목록에 없는 번호는 절대 만들지 않는다.`;

export function buildSynthesizerPrompt(
  context: DiagnosisContext,
  evidence: EvidenceAnalysis,
  stage: StageDiagnosis,
  bottleneck: BottleneckAnalysis,
  redTeam: RedTeamReview,
  resources: ResourceRow[],
): string {
  const catalogue = resources
    .map(
      (resource, index) =>
        `${index + 1}. (${RESOURCE_TYPE_LABEL[resource.resource_type]}) ${resource.title} — ${resource.description} [stage: ${resource.stage_tags.join("/")}] [bottleneck: ${resource.bottleneck_tags.join("/")}]`,
    )
    .join("\n");

  return `${formatContext(context)}

# Evidence Analyst
${JSON.stringify(evidence, null, 2)}

# Stage Diagnoser
${JSON.stringify(stage, null, 2)}

# Bottleneck Analyst
${JSON.stringify(bottleneck, null, 2)}

# Red Team
${JSON.stringify(redTeam, null, 2)}

# 추천 가능한 리소스 목록 (전문가 · 도구 · 자료)
${catalogue || "(없음)"}

최종 리포트를 작성하라.`;
}
