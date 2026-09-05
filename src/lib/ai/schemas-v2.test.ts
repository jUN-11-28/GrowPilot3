import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ExecutionConstraintsSchema,
  NextExperimentV2Schema,
  SynthesisV2Schema,
  TechnicalContextSchema,
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
