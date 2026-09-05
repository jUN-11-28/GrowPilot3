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
    unverified_hypotheses: [
      {
        statement: "[MOCK] 타깃 고객이 이 문제에 돈을 낼 것이다",
        why_unverified: "가격을 제시받은 고객이 아직 한 명도 없다.",
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
      evidence_gap: "Problem 단계의 최소 증거인 고객 인터뷰 기록과 문제 발생 빈도가 하나도 없다.",
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
    evidence_gap:
      "[MOCK] Problem 단계의 최소 증거(고객 인터뷰, 문제 발생 빈도)가 하나도 확보되지 않았다.",
    bottleneck_tags: ["problem_evidence", "willingness_to_pay"],
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
      verification_method:
        "인터뷰마다 '최근 1개월 내 발생 여부'와 '현재 지불 중인 비용'을 표 한 줄로 기록하고, 14일 뒤 표를 센다.",
      success_criteria: ["8명 인터뷰 완료", "5명 이상이 최근 1개월 내 문제 경험을 진술"],
      stop_condition:
        "[MOCK] 15명에게 요청했는데 인터뷰 성사가 2건 이하면 타깃 고객 정의부터 다시 잡는다.",
    },
  },
  resource: {
    strategy: "[MOCK] 제품을 더 만들기 전에 문제 존재를 1차 기록으로 확인한다.",
    // 자원 · 전문가 · 도구가 한 번씩 나오도록 고정한 값.
    picks: [
      { number: 1, reason: "[MOCK] 인터뷰에서 유도 질문을 피하는 기준서로 쓴다." },
      { number: 2, reason: "[MOCK] 인터뷰 대상자 섭외와 일정 조율에 쓴다." },
      { number: 3, reason: "[MOCK] 인용 가능한 원문을 남기기 위해 쓴다." },
    ],
  },

  // -------------------------------------------------------------------------
  // v2 fixtures. `evidence_id`/`candidate_id` values here are deliberately
  // *not* pre-normalized (temp_1 rather than ev_1) — pipeline-v2.ts's
  // normalizeEvidenceIds is expected to re-key them, same as it would for a
  // real model response, so running this fixture through the real pipeline
  // exercises that step instead of hiding it.
  // -------------------------------------------------------------------------
  evidence_v2: {
    available_evidence: [
      {
        evidence_id: "temp_1",
        claim: "[MOCK] 창업자가 프로토타입 1대로 자체 벤치 테스트를 3회 실시했다.",
        source_refs: [
          { source_id: "project:main", locator: null, excerpt: null, locator_status: "unavailable" },
        ],
        provenance: "founder_report",
        evidence_domain: "technical",
        observation_kind: "technical_test",
        period: "최근 2주",
        population: null,
        sample_size: 3,
        numerator: null,
        denominator: null,
        conditions: "실내, 상온, 목업 부하 조건",
        supports: "핵심 기능이 통제된 조건에서 3회 동작했다는 것.",
        does_not_establish: "실제 사용 환경에서의 신뢰성이나 고객 가치.",
        limitations: "표본 3회, 창업자 본인이 직접 관찰·보고함.",
      },
    ],
    unverified_hypotheses: [
      {
        statement: "[MOCK] 타깃 고객이 이 성능 차이를 체감하고 구매로 이어질 것이다",
        source_refs: [],
        why_unverified: "고객에게 실물을 보여주고 반응을 관찰한 기록이 없다.",
      },
    ],
    missing_evidence: [
      {
        label: "[MOCK] 실사용 환경 반복 시험 기록",
        why_it_matters: "벤치 테스트만으로는 실제 배포 환경에서의 신뢰성을 판단할 수 없다.",
        availability: "not_collected",
      },
    ],
    conflicts: [],
    summary: "[MOCK] 기술 근거는 통제된 소규모 자체 시험 수준이고, 고객 근거는 아직 없다.",
    coverage_limitations: ["고객 관련 근거가 전혀 없어 상업적 판단은 불가능하다."],
  },
  stage_v2: {
    current_stage: "solution",
    stage_status: "provisional",
    reasoning:
      "[MOCK] 통제된 환경의 기술 시험은 있으나 고객 반응 근거가 없어 Solution 단계로 잠정한다.",
    limitations: ["고객 문제·가치 영역은 근거가 전혀 없어 이 판정은 기술 영역에 크게 의존한다."],
    readiness: [
      {
        dimension: "technical_feasibility",
        status: "partial",
        supporting_evidence_ids: ["ev_1"],
        contradicting_evidence_ids: [],
        missing_information: ["실사용 환경 반복 시험"],
        scope: null,
      },
      {
        dimension: "customer_problem",
        status: "unknown",
        supporting_evidence_ids: [],
        contradicting_evidence_ids: [],
        missing_information: ["고객 인터뷰 기록"],
        scope: null,
      },
      {
        dimension: "solution_value",
        status: "unknown",
        supporting_evidence_ids: [],
        contradicting_evidence_ids: [],
        missing_information: ["고객에게 실물을 보여준 반응 기록"],
        scope: null,
      },
      {
        dimension: "commercial_validation",
        status: "not_supported",
        supporting_evidence_ids: [],
        contradicting_evidence_ids: [],
        missing_information: ["판매 시도 또는 결제 기록"],
        scope: null,
      },
      {
        dimension: "repeat_use",
        status: "not_applicable",
        supporting_evidence_ids: [],
        contradicting_evidence_ids: [],
        missing_information: [],
        scope: "아직 사용자가 없어 반복 사용을 판단할 단계가 아니다.",
      },
      {
        dimension: "delivery_scalability",
        status: "unknown",
        supporting_evidence_ids: [],
        contradicting_evidence_ids: [],
        missing_information: ["생산·공급 계획"],
        scope: null,
      },
    ],
  },
  bottleneck_v2: {
    candidates: [
      {
        candidate_id: "cand_1",
        statement: "[MOCK] 실사용 환경에서도 핵심 기능이 반복적으로 동작하는지 확인되지 않았다",
        diagnosis_status: "insufficient_information",
        supporting_evidence_ids: ["ev_1"],
        opposing_evidence_ids: [],
        missing_information: ["실사용 환경 반복 시험 기록"],
        impact: "이후 고객 실험 전체가 이 전제 위에 서 있다.",
        urgency: "고객에게 보여주기 전에 확인해야 한다.",
        dependency: "고객 실험보다 선행되어야 한다.",
        feasibility: "창업자가 직접 반복 시험을 설계·실행할 수 있다.",
        priority_reason: "기술 신뢰성이 불확실한 채로 고객 실험을 하면 결과 해석이 어려워진다.",
      },
    ],
    selected_candidate_id: "cand_1",
    selection_reason: "[MOCK] 고객 대상 실험에 앞서 기술 신뢰성 확인이 선행 조건이다.",
    deferred_candidates: [],
    lean_analyst_opinion:
      "[MOCK] 지금은 고객을 만나기보다 반복 시험으로 기술 신뢰성부터 좁히는 편이 낫다.",
  },
  red_team_v2: {
    verdict: "holds",
    challenges: [
      {
        target_candidate_id: "cand_1",
        claim: "[MOCK] 벤치 테스트 3회를 신뢰성의 근거로 과대 해석했을 수 있다.",
        evidence_ids: ["ev_1"],
        reason: "표본이 3회뿐이며 창업자 본인의 보고에 의존한다.",
        suggested_resolution: "반복 횟수를 늘리거나 제3자가 관찰한 시험으로 보강한다.",
      },
    ],
    alternative_candidate: null,
    counterargument:
      "[MOCK] 반박은 판정 자체보다 표본 크기와 보고 주체의 한계를 더 분명히 밝히자는 것이다.",
    revision_note: "결론은 유지하되, 3회·자가 보고라는 한계를 리포트에 그대로 남긴다.",
  },
  synthesis_v2: {
    schema_version: 2,
    current_stage: "solution",
    stage_status: "provisional",
    readiness: [
      {
        dimension: "technical_feasibility",
        status: "partial",
        supporting_evidence_ids: ["ev_1"],
        contradicting_evidence_ids: [],
        missing_information: ["실사용 환경 반복 시험"],
        scope: null,
      },
    ],
    diagnosis_status: "insufficient_information",
    critical_bottleneck:
      "[MOCK] 실사용 환경에서도 핵심 기능이 반복적으로 동작하는지 아직 확인되지 않았다",
    bottleneck_reason:
      "[MOCK] 이것이 확인되지 않으면 이후 고객 실험 결과를 해석할 기준이 없다.",
    evidence_gap: "[MOCK] 자가 보고 3회 벤치 테스트 외에 반복 시험 기록이 없다.",
    supporting_evidence_ids: ["ev_1"],
    missing_evidence: [
      { label: "[MOCK] 실사용 환경 반복 시험 기록", why_it_matters: "신뢰성 판단의 최소 근거다." },
    ],
    bottleneck_tags: ["technical_feasibility", "prototype_reliability"],
    lean_analyst_opinion:
      "[MOCK] 고객을 만나기 전에 반복 시험으로 신뢰성부터 좁히는 편이 낫다.",
    red_team_counterargument:
      "[MOCK] 표본 3회·자가 보고라는 한계를 리포트에 분명히 남겨야 한다는 반박을 수용한다.",
    review_resolution: [
      {
        item: "[MOCK] 벤치 테스트 3회의 과대 해석 우려",
        resolution: "accepted",
        reason: "표본 한계를 리포트와 다음 실험 설계에 명시했다.",
      },
    ],
    next_experiment: {
      title: "[MOCK] 프로토타입 반복 신뢰성 시험 10회",
      action_type: "technical_test",
      hypothesis: "동일 조건에서 10회 반복 시 8회 이상 핵심 기능이 정상 동작한다.",
      decision_to_inform: "고객에게 보여줄 준비가 됐는지 판단하는 데 쓴다.",
      target_and_recruitment: "창업자 본인이 보유한 프로토타입 1대로 진행한다.",
      method: [
        "동일한 조건(실내, 상온, 목업 부하)을 고정한다",
        "10회 반복 시험을 진행하고 매 회 성공/실패를 기록한다",
        "실패 시 원인을 짧게 메모한다",
      ],
      execution_window_days: 7,
      review_after_days: 7,
      observation_window_days: null,
      observation_end_condition: null,
      timing_reason: "장비 재설정 없이 하루 1~2회씩 진행하면 7일 안에 10회를 채울 수 있다.",
      metric: {
        name: "반복 성공률",
        definition: "10회 시행 중 핵심 기능이 정상 동작한 횟수 비율",
        population: null,
        denominator_definition: "총 시행 횟수(10회)",
        recording_method: "매 회 성공/실패를 표에 기록",
        baseline: null,
        target_sample: 10,
        measure_kind: "rate",
      },
      verification_method: "표의 성공 횟수를 세어 10회 중 8회 이상인지 확인한다.",
      success_criteria: ["10회 중 8회 이상 정상 동작"],
      criteria_basis: "[MOCK] 아직 업계 기준이 확인되지 않아 창업자가 잠정 제안한 기준이다.",
      criteria_status: "proposed",
      outcome_rules: {
        supports: "8회 이상 성공하면 고객 실험으로 넘어갈 준비가 됐다고 본다.",
        does_not_support: "5회 이하 성공하면 설계를 다시 점검한다.",
        inconclusive: "6~7회 성공하면 실패 원인을 분류해 재시험 여부를 정한다.",
        incomplete: "10회를 채우지 못하면 채운 횟수까지만 기록하고 재개 조건을 정한다.",
      },
      stop_condition: "3회 연속 실패하면 즉시 멈추고 설계 결함부터 점검한다.",
      estimated_hours: 6,
      estimated_cost: { amount: 0, currency: "KRW" },
      feasibility_status: "fits",
      unresolved_constraints: [],
      limitations: ["창업자 1인이 관찰하므로 관찰자 편향 가능성이 있다."],
    },
  },
  resource_v2: {
    strategy: "[MOCK] 반복 시험 기록을 남기는 데 필요한 것만 고른다.",
    status: "available",
    picks: [
      {
        number: 1,
        reason: "[MOCK] 10회 시행 결과를 빠짐없이 표로 남기는 데 쓴다.",
        action_step: "시험 전 표 양식을 만들어 매 회 즉시 기록한다.",
        conditions_to_confirm: [],
      },
    ],
    empty_reason: null,
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
