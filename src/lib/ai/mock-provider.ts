import "server-only";

import type { AIProvider, StructuredRequest } from "@/lib/ai/provider";

/**
 * ⚠️ MOCK DATA — enabled only when AI_PROVIDER=mock.
 * Exists so the diagnosis UI can be developed without spending API calls.
 * Nothing here is a real analysis; it must never be reachable in production.
 */
const FIXTURES: Record<string, unknown> = {
  question: {
    questions: [
      {
        reason: "[MOCK] 문제의 심각도를 확인할 근거가 아직 없습니다.",
        question: "[MOCK] 최근 한 달 동안 이 문제를 겪는 사람과 직접 이야기한 적이 몇 번 있나요?",
        question_type: "single_choice",
        options: ["없음", "1~4회", "5~10회", "10회 이상"],
      },
      {
        reason: "[MOCK] 지불 의사를 직접 확인한 적이 있는지 모릅니다.",
        question: "[MOCK] 이 문제를 해결하는 데 이미 돈을 쓰고 있는 사람을 본 적이 있나요?",
        question_type: "single_choice",
        options: ["있다", "없다", "모르겠다"],
      },
      {
        reason: "[MOCK] 대안 대비 차별점을 확인할 근거가 없습니다.",
        question: "[MOCK] 지금 이 문제를 겪는 사람들은 어떤 방법으로 임시로 해결하고 있나요?",
        question_type: "text",
        options: [],
      },
    ],
  },
  evidence: {
    available_evidence: [
      {
        label: "[MOCK] 창업자의 문제 정의",
        summary: "문제를 구체적으로 기술했으나 외부 검증은 없다.",
        strength: "weak",
      },
    ],
    missing_evidence: [
      {
        label: "[MOCK] 고객 인터뷰 기록",
        stage: "problem",
        why_it_matters: "문제가 실재하는지 확인할 1차 근거가 없다.",
      },
    ],
    evidence_confidence: 25,
    summary: "[MOCK] 판단에 쓸 수 있는 외부 근거가 거의 없다.",
  },
  stage: {
    current_stage: "problem",
    stage_confidence: 45,
    reasoning: "[MOCK] 고객 측 근거가 없어 Problem 단계로 본다.",
    unmet_prerequisites: [
      { stage: "problem", missing: "타깃 고객이 이 문제를 실제로 겪는다는 증거" },
    ],
  },
  bottleneck: {
    candidates: [
      {
        statement: "[MOCK] 문제가 실재하는지 확인되지 않았다",
        stage: "problem",
        why_blocking: "이후 모든 판단이 이 가정 위에 서 있다.",
        evidence_gap: "고객 인터뷰 없음",
      },
    ],
    critical_bottleneck: {
      statement: "[MOCK] 타깃 고객이 이 문제를 돈이나 시간을 들여 해결할 만큼 아프게 느끼는지 아직 확인되지 않았다",
      stage: "problem",
      reason: "선행 단계의 전제가 비어 있어 후행 단계 지표는 의미를 갖지 못한다.",
      supporting_evidence: ["창업자가 문제를 구체적으로 기술함"],
      missing_evidence: ["고객 인터뷰 5건 이상", "문제 발생 빈도"],
    },
    lean_analyst_opinion: "[MOCK] 지금은 만들 때가 아니라 확인할 때다.",
  },
  red_team: {
    counterargument: "[MOCK] 창업자가 해당 산업 종사자라면 문제 존재는 이미 알 수도 있다.",
    challenged_assumptions: ["창업자의 문제 진술을 근거 없음으로 취급함"],
    alternative_bottleneck: "",
    verdict: "holds",
    revision_note: "문제 존재보다 '지불 의사'로 병목을 좁힐 여지가 있다.",
  },
  synthesis: {
    current_stage: "problem",
    stage_confidence: 45,
    evidence_confidence: 25,
    critical_bottleneck:
      "[MOCK] 타깃 고객이 이 문제를 돈을 내고 해결할 만큼 아프게 느끼는지 아직 확인되지 않았다",
    bottleneck_reason:
      "[MOCK] 이 가정이 참이 아니면 이후의 제품·채널 판단이 모두 무의미해지기 때문이다.",
    supporting_evidence: ["문제 정의가 구체적임"],
    missing_evidence: ["고객 인터뷰", "문제 발생 빈도", "현재 대안에 지불 중인 비용"],
    lean_analyst_opinion: "[MOCK] 지금은 만들 때가 아니라 확인할 때다.",
    red_team_counterargument: "[MOCK] 창업자가 업계 경험자라면 이미 알고 있을 수도 있다.",
    next_experiment: {
      title: "[MOCK] 타깃 고객 8명 문제 인터뷰",
      hypothesis: "타깃 고객 8명 중 5명 이상이 최근 1개월 내 이 문제를 겪었다고 말한다.",
      method: [
        "타깃 정의에 맞는 후보 15명 목록을 만든다",
        "The Mom Test 방식으로 과거 행동만 묻는다",
        "인터뷰 내용을 표로 정리한다",
      ],
      success_criteria: ["8명 인터뷰 완료", "5명 이상이 최근 1개월 내 문제 경험을 진술"],
      duration: "2주",
    },
    // 자원 · 전문가 · 도구가 한 번씩 나오도록 고정한 값.
    recommended_resource_numbers: [1, 17, 24],
  },
};

export const mockProvider: AIProvider = {
  name: "mock",
  async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const fixture = FIXTURES[request.kind];
    if (!fixture) {
      throw new Error(`No mock fixture for agent "${request.kind}".`);
    }
    return request.schema.parse(fixture);
  },
};
