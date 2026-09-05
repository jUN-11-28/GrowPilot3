import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EvidenceRecordDraftV2Schema,
  ExecutionConstraintsSchema,
  NextExperimentV2Schema,
  SynthesisV2Schema,
  TechnicalContextSchema,
  UserEvidenceContextSchema,
} from "./schemas-v2";

// --- 14일 실행 vs 관찰 기간 구분 (scenario #6): the bound is structural, not just prompt wording ---

const baseExperiment = {
  title: "t",
  action_type: "customer_experiment" as const,
  hypothesis: "h",
  decision_to_inform: "d",
  target_and_recruitment: "r",
  method: ["do a thing"],
  review_after_days: 7,
  observation_window_days: null,
  observation_end_condition: null,
  timing_reason: "tr",
  metric: {
    name: "m",
    definition: "def",
    population: null,
    denominator_definition: null,
    recording_method: "rec",
    baseline: null,
    target_sample: null,
    measure_kind: "count" as const,
  },
  verification_method: "v",
  success_criteria: ["done"],
  criteria_basis: "cb",
  criteria_status: "proposed" as const,
  outcome_rules: { supports: "s", does_not_support: "d", inconclusive: "i", incomplete: "c" },
  stop_condition: "sc",
  estimated_hours: null,
  estimated_cost: { amount: null, currency: null },
  feasibility_status: "fits" as const,
  unresolved_constraints: [],
  limitations: [],
};

test("NextExperimentV2Schema accepts execution_window_days at the 14-day ceiling", () => {
  const result = NextExperimentV2Schema.safeParse({ ...baseExperiment, execution_window_days: 14 });
  assert.equal(result.success, true);
});

test("NextExperimentV2Schema rejects execution_window_days past 14 — the fixed-duration constraint is structural, not just a prompt instruction", () => {
  const result = NextExperimentV2Schema.safeParse({ ...baseExperiment, execution_window_days: 15 });
  assert.equal(result.success, false);
});

test("NextExperimentV2Schema rejects execution_window_days below 1", () => {
  const result = NextExperimentV2Schema.safeParse({ ...baseExperiment, execution_window_days: 0 });
  assert.equal(result.success, false);
});

test("NextExperimentV2Schema allows hypothesis: null for a prep/measurement action with no gate to fabricate", () => {
  const result = NextExperimentV2Schema.safeParse({
    ...baseExperiment,
    execution_window_days: 14,
    action_type: "measurement_setup",
    hypothesis: null,
  });
  assert.equal(result.success, true);
});

// --- "모름" stays null, never coerced to 0 or "" (scenario #7) --------------

test("TechnicalContextSchema defaults every field to null rather than requiring a value", () => {
  const result = TechnicalContextSchema.safeParse({});
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.technology_type, null);
    assert.equal(result.data.sales_cycle_days, null);
    assert.equal(result.data.usage_cycle_days, null);
  }
});

test("TechnicalContextSchema rejects an unrecognised technology_type rather than silently coercing it", () => {
  const result = TechnicalContextSchema.safeParse({ technology_type: "not_a_real_type" });
  assert.equal(result.success, false);
});

test("ExecutionConstraintsSchema defaults hard_constraints to an empty array and everything else to null", () => {
  const result = ExecutionConstraintsSchema.safeParse({});
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data.hard_constraints, []);
    assert.equal(result.data.hours_per_week, null);
    assert.equal(result.data.budget_amount, null);
  }
});

// --- bottleneck_tags stays an open string array (unknown tags handled in validate-v2, not schema) ---

test("SynthesisV2Schema.bottleneck_tags accepts any string (allowed-list enforcement is a server-side, not schema-level, concern)", () => {
  const result = SynthesisV2Schema.shape.bottleneck_tags.safeParse(["not_a_known_tag", "technical_feasibility"]);
  assert.equal(result.success, true);
});

test("SynthesisV2Schema.bottleneck_tags caps at 3 entries", () => {
  const result = SynthesisV2Schema.shape.bottleneck_tags.safeParse(["a", "b", "c", "d"]);
  assert.equal(result.success, false);
});

// --- Evidence records (Evidence별 근거 자료 등록) ----------------------------

test("UserEvidenceContextSchema defaults every field to null (missing input never becomes a guessed 0 or empty string)", () => {
  const result = UserEvidenceContextSchema.safeParse({});
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.occurred_at, null);
    assert.equal(result.data.target_description, null);
    assert.equal(result.data.interview_count, null);
    assert.equal(result.data.unique_participant_count, null);
  }
});

test("UserEvidenceContextSchema rejects a negative headcount rather than silently clamping it", () => {
  const result = UserEvidenceContextSchema.safeParse({ interview_count: -1 });
  assert.equal(result.success, false);
});

function evidenceDraft(overrides: Partial<Parameters<typeof EvidenceRecordDraftV2Schema.parse>[0]> = {}) {
  return {
    what: null,
    when_text: null,
    who_description: null,
    interview_count: { value: null, known: false },
    unique_participant_count: { value: null, known: false },
    purpose: null,
    method: [],
    key_results: [],
    metrics: [],
    quotes: [],
    conflicting_points: [],
    unknowns: [],
    duplicate_suspected: { suspected: false, reason: null },
    purchase_signal: null,
    summary: "요약",
    ...overrides,
  };
}

test("EvidenceRecordDraftV2Schema accepts a count marked known:false with value:null (\"모름\", never a fabricated number)", () => {
  const result = EvidenceRecordDraftV2Schema.safeParse(evidenceDraft());
  assert.equal(result.success, true);
});

// --- scenario #6: interview count vs. unique participant count are distinct fields, never derived from each other ---

test("EvidenceRecordDraftV2Schema keeps interview_count and unique_participant_count as independent fields — a same person interviewed twice can report 2 interviews / 1 participant", () => {
  const result = EvidenceRecordDraftV2Schema.safeParse(
    evidenceDraft({
      interview_count: { value: 2, known: true },
      unique_participant_count: { value: 1, known: true },
    }),
  );
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.interview_count.value, 2);
    assert.equal(result.data.unique_participant_count.value, 1);
  }
});

// --- scenario: purchase interest vs. intent vs. contract vs. actual payment are distinguished, not collapsed ---

test("EvidenceRecordDraftV2Schema's purchase_signal distinguishes interest/intent/contract/payment and allows null", () => {
  for (const signal of ["interest", "intent", "contract", "payment", null]) {
    const result = EvidenceRecordDraftV2Schema.safeParse(evidenceDraft({ purchase_signal: signal }));
    assert.equal(result.success, true, `expected ${signal} to be valid`);
  }
  const invalid = EvidenceRecordDraftV2Schema.safeParse(evidenceDraft({ purchase_signal: "maybe" }));
  assert.equal(invalid.success, false);
});

test("EvidenceRecordDraftV2Schema rejects a count that carries a value but omits the known flag (the schema forces the model to commit to known/unknown, not just a bare number)", () => {
  const result = EvidenceRecordDraftV2Schema.safeParse(
    evidenceDraft({ interview_count: { value: 3 } as unknown as { value: number; known: boolean } }),
  );
  assert.equal(result.success, false);
});
