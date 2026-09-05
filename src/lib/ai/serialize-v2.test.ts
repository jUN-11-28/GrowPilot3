import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEvidenceLookup, serializeSynthesisV2ToLegacyColumns } from "./serialize-v2";
import type { EvidenceAnalysisV2, SynthesisV2 } from "./schemas-v2";

const evidence: EvidenceAnalysisV2 = {
  available_evidence: [
    {
      evidence_id: "ev_1",
      claim: "3회 벤치 테스트 성공",
      source_refs: [{ source_id: "project:main", locator: null, excerpt: null, locator_status: "unavailable" }],
      provenance: "founder_report",
      evidence_domain: "technical",
      observation_kind: "technical_test",
      period: null,
      population: null,
      sample_size: 3,
      numerator: null,
      denominator: null,
      conditions: null,
      supports: "s",
      does_not_establish: "d",
      limitations: "l",
    },
  ],
  unverified_hypotheses: [],
  missing_evidence: [],
  conflicts: [],
  summary: "",
  coverage_limitations: [],
};

function synthesisWith(overrides: Partial<SynthesisV2["next_experiment"]>): SynthesisV2 {
  return {
    schema_version: 2,
    current_stage: "solution",
    stage_status: "provisional",
    readiness: [],
    diagnosis_status: "insufficient_information",
    critical_bottleneck: "병목 문장",
    bottleneck_reason: "이유",
    evidence_gap: "공백",
    supporting_evidence_ids: ["ev_1"],
    missing_evidence: [{ label: "누락", why_it_matters: "중요" }],
    bottleneck_tags: [],
    lean_analyst_opinion: "의견",
    red_team_counterargument: "반박",
    review_resolution: [],
    next_experiment: {
      title: "실험",
      action_type: "customer_experiment",
      hypothesis: "가설",
      decision_to_inform: "결정",
      target_and_recruitment: "대상",
      method: ["단계1"],
      execution_window_days: 7,
      review_after_days: 7,
      observation_window_days: null,
      observation_end_condition: null,
      timing_reason: "이유",
      metric: {
        name: "지표",
        definition: "정의",
        population: null,
        denominator_definition: null,
        recording_method: "기록",
        baseline: null,
        target_sample: null,
        measure_kind: "count",
      },
      verification_method: "검증",
      success_criteria: ["기준"],
      criteria_basis: "근거",
      criteria_status: "proposed",
      outcome_rules: { supports: "s", does_not_support: "d", inconclusive: "i", incomplete: "c" },
      stop_condition: "중단",
      estimated_hours: null,
      estimated_cost: { amount: null, currency: null },
      feasibility_status: "fits",
      unresolved_constraints: [],
      limitations: [],
      ...overrides,
    },
  };
}

test("serializeSynthesisV2ToLegacyColumns folds provenance and source into the legacy supporting_evidence string", () => {
  const legacy = serializeSynthesisV2ToLegacyColumns(synthesisWith({}), buildEvidenceLookup(evidence));
  assert.equal(legacy.supporting_evidence.length, 1);
  assert.match(legacy.supporting_evidence[0], /3회 벤치 테스트 성공/);
  assert.match(legacy.supporting_evidence[0], /창업자 보고/);
  assert.match(legacy.supporting_evidence[0], /project:main/);
});

test("serializeSynthesisV2ToLegacyColumns falls back to the raw id when an evidence_id has no matching record", () => {
  const legacy = serializeSynthesisV2ToLegacyColumns(
    { ...synthesisWith({}), supporting_evidence_ids: ["ev_ghost"] },
    buildEvidenceLookup(evidence),
  );
  assert.deepEqual(legacy.supporting_evidence, ["ev_ghost"]);
});

test("serializeSynthesisV2ToLegacyColumns never fabricates a hypothesis when next_experiment has none — it marks the gap explicitly", () => {
  const legacy = serializeSynthesisV2ToLegacyColumns(
    synthesisWith({ hypothesis: null, decision_to_inform: "고객 접근 가능성 확인" }),
    buildEvidenceLookup(evidence),
  );
  assert.match(legacy.next_experiment.hypothesis, /가설 없음/);
  assert.match(legacy.next_experiment.hypothesis, /고객 접근 가능성 확인/);
});

test("serializeSynthesisV2ToLegacyColumns derives duration from execution_window_days, not a hardcoded 14일", () => {
  const legacy = serializeSynthesisV2ToLegacyColumns(synthesisWith({ execution_window_days: 7 }), buildEvidenceLookup(evidence));
  assert.equal(legacy.next_experiment.duration, "7일");
});

test("serializeSynthesisV2ToLegacyColumns carries current_stage through as-is, including null", () => {
  const legacyWithStage = serializeSynthesisV2ToLegacyColumns(synthesisWith({}), buildEvidenceLookup(evidence));
  assert.equal(legacyWithStage.current_stage, "solution");

  const legacyWithoutStage = serializeSynthesisV2ToLegacyColumns(
    { ...synthesisWith({}), current_stage: null },
    buildEvidenceLookup(evidence),
  );
  assert.equal(legacyWithoutStage.current_stage, null);
  assert.equal(legacyWithoutStage.stage_confidence, null);
  assert.equal(legacyWithoutStage.evidence_confidence, null);
});
