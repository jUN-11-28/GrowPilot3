import { z } from "zod";
import {
  BUSINESS_MODEL_VALUES,
  READINESS_DIMENSION_VALUES_V2,
  TECHNICAL_MATURITY_VALUES,
  TECHNOLOGY_TYPE_VALUES,
} from "@/lib/domain/constants";

/**
 * v2 model-output contracts (GrowPilot_AI_프롬프트_v2.md §2).
 *
 * These schemas are sent to the model as JSON Schema (via z.toJSONSchema) and
 * are deliberately free of `.refine()` / `.transform()` / cross-field
 * constraints — those keywords either don't survive JSON-Schema conversion or
 * silently stop being enforced once Gemini only sees the converted schema.
 * Anything that needs another field to check (an id that must exist elsewhere,
 * "at most N total across the object", a range that depends on the current
 * result) lives in `validate-v2.ts` and runs after `schema.parse()` on the
 * server, where it always executes.
 *
 * `QuestionBatchSchema` (unchanged in v2 — see prompt doc §2.8) is re-exported
 * from `schemas.ts` rather than duplicated here.
 */
import { growthStage, QuestionBatchSchema } from "@/lib/ai/schemas";

export { growthStage, QuestionBatchSchema };
export type { QuestionBatch, PlannedQuestion } from "@/lib/ai/schemas";

// ---------------------------------------------------------------------------
// 2.1 TechnicalContext / ExecutionConstraints — server-side INPUT validation
// for `projects.technical_context` / `projects.execution_constraints`. These
// are founder input (from the project form / edit form), not model output —
// unlike everything else in this file they are never sent to the model as a
// JSON Schema, so `.refine()` would be safe here, but none is needed: every
// constraint below is already structural.
//
// Every field is optional/nullable and defaults to nothing being asked —
// "모름"은 0이나 기본값이 아니라 null이다 (prompt doc §2.1).
// ---------------------------------------------------------------------------

export const TechnicalContextSchema = z.object({
  technology_type: z.enum(TECHNOLOGY_TYPE_VALUES).nullable().default(null),
  business_model: z.enum(BUSINESS_MODEL_VALUES).nullable().default(null),
  user_role: z.string().trim().max(200).nullable().default(null),
  buyer_role: z.string().trim().max(200).nullable().default(null),
  technical_maturity: z.enum(TECHNICAL_MATURITY_VALUES).nullable().default(null),
  // Founders don't know these to the day; a whole number of days is already
  // more precision than most will have, and 0 is never used as "unknown".
  sales_cycle_days: z.number().int().min(0).max(3650).nullable().default(null),
  usage_cycle_days: z.number().int().min(0).max(3650).nullable().default(null),
});
export type TechnicalContextInput = z.infer<typeof TechnicalContextSchema>;

export const ExecutionConstraintsSchema = z.object({
  hours_per_week: z.number().min(0).max(168).nullable().default(null),
  budget_amount: z.number().min(0).nullable().default(null),
  budget_currency: z.string().trim().max(10).nullable().default(null),
  customer_access: z.string().trim().max(1000).nullable().default(null),
  test_environment_access: z.string().trim().max(1000).nullable().default(null),
  hard_constraints: z.array(z.string().trim().max(500)).max(20).default([]),
});
export type ExecutionConstraintsInput = z.infer<typeof ExecutionConstraintsSchema>;

// ---------------------------------------------------------------------------
// shared fragments
// ---------------------------------------------------------------------------

export const sourceTypeV2 = z.enum([
  "project_input",
  "answer",
  "attachment",
  "experiment_result",
  "prior_ai_report",
]);

export const loadStatusV2 = z.enum([
  "loaded",
  "note_only",
  "omitted_size",
  "unsupported",
  "failed",
]);

/** Server-built, not model output — validated on the way in, not generated. */
export const SourceManifestEntrySchema = z.object({
  source_id: z.string(),
  source_type: sourceTypeV2,
  attachment_id: z.string().nullable(),
  file_name: z.string().nullable(),
  note: z.string().nullable(),
  created_at: z.string(),
  load_status: loadStatusV2,
  load_error_code: z.string().nullable(),
});
export type SourceManifestEntry = z.infer<typeof SourceManifestEntrySchema>;

const locatorStatusV2 = z.enum(["verified", "unverified", "unavailable"]);

const sourceRefV2 = z.object({
  source_id: z.string(),
  locator: z.string().nullable(),
  excerpt: z.string().nullable(),
  locator_status: locatorStatusV2,
});
export type SourceRefV2 = z.infer<typeof sourceRefV2>;

// ---------------------------------------------------------------------------
// 2.2 EvidenceAnalysisV2
// ---------------------------------------------------------------------------

const provenanceV2 = z.enum(["source_observation", "founder_report", "third_party_report"]);
const evidenceDomainV2 = z.enum(["technical", "customer", "commercial", "operational"]);
const observationKindV2 = z.enum([
  "technical_test",
  "usage",
  "payment",
  "interview_statement",
  "adoption_intent",
  "operational_record",
  "other",
]);

/**
 * The model proposes `evidence_id` itself, scoped to this one response — it
 * has no way to know ids assigned in other calls. The server checks
 * uniqueness and re-keys to a stable id before anything downstream (Stage,
 * Bottleneck, Red Team, Synthesis) is allowed to reference it — see
 * `validate-v2.ts#normalizeEvidenceIds`.
 */
const availableEvidenceItemV2 = z.object({
  evidence_id: z.string(),
  claim: z.string(),
  source_refs: z.array(sourceRefV2),
  provenance: provenanceV2,
  evidence_domain: evidenceDomainV2,
  observation_kind: observationKindV2,
  period: z.string().nullable(),
  population: z.string().nullable(),
  sample_size: z.number().int().nonnegative().nullable(),
  numerator: z.number().nullable(),
  denominator: z.number().nullable(),
  conditions: z.string().nullable(),
  supports: z.string(),
  does_not_establish: z.string(),
  limitations: z.string(),
});

const missingEvidenceItemV2 = z.object({
  label: z.string(),
  why_it_matters: z.string(),
  availability: z.enum(["not_collected", "not_provided", "unreadable", "unknown"]),
});

export const EvidenceAnalysisV2Schema = z.object({
  // A generous operational cap (not part of the spec) so one call can't
  // return an unbounded amount of text; nothing in the brief limits this.
  available_evidence: z.array(availableEvidenceItemV2).max(40),
  unverified_hypotheses: z
    .array(
      z.object({
        statement: z.string(),
        source_refs: z.array(sourceRefV2),
        why_unverified: z.string(),
      }),
    )
    .max(40),
  missing_evidence: z.array(missingEvidenceItemV2).max(40),
  conflicts: z
    .array(
      z.object({
        evidence_ids: z.array(z.string()),
        description: z.string(),
        needed_resolution: z.string(),
      }),
    )
    .max(20),
  summary: z.string(),
  coverage_limitations: z.array(z.string()).max(20),
});
export type EvidenceAnalysisV2 = z.infer<typeof EvidenceAnalysisV2Schema>;

// ---------------------------------------------------------------------------
// 2.3 StageDiagnosisV2
// ---------------------------------------------------------------------------

export const stageStatusV2 = z.enum(["provisional", "unknown"]);

export const readinessDimensionV2 = z.enum(READINESS_DIMENSION_VALUES_V2);

export const readinessStatusV2 = z.enum([
  "supported",
  "partial",
  "not_supported",
  "unknown",
  "not_applicable",
]);

const readinessItemV2 = z.object({
  dimension: readinessDimensionV2,
  status: readinessStatusV2,
  supporting_evidence_ids: z.array(z.string()).max(30),
  contradicting_evidence_ids: z.array(z.string()).max(30),
  missing_information: z.array(z.string()).max(20),
  // Required to carry a reason when status is not_applicable — that
  // cross-field rule is enforced in validate-v2.ts, not here.
  scope: z.string().nullable(),
});
export type ReadinessItemV2 = z.infer<typeof readinessItemV2>;

export const StageDiagnosisV2Schema = z.object({
  current_stage: growthStage.nullable(),
  stage_status: stageStatusV2,
  reasoning: z.string(),
  limitations: z.array(z.string()).max(20),
  readiness: z.array(readinessItemV2).max(6),
});
export type StageDiagnosisV2 = z.infer<typeof StageDiagnosisV2Schema>;

// ---------------------------------------------------------------------------
// 2.4 BottleneckAnalysisV2
// ---------------------------------------------------------------------------

export const diagnosisStatusV2 = z.enum([
  "observed_issue",
  "suspected_cause",
  "insufficient_information",
]);

const bottleneckCandidateV2 = z.object({
  candidate_id: z.string(),
  statement: z.string(),
  diagnosis_status: diagnosisStatusV2,
  supporting_evidence_ids: z.array(z.string()).max(30),
  opposing_evidence_ids: z.array(z.string()).max(30),
  missing_information: z.array(z.string()).max(20),
  impact: z.string(),
  urgency: z.string(),
  dependency: z.string(),
  feasibility: z.string(),
  priority_reason: z.string(),
});
export type BottleneckCandidateV2 = z.infer<typeof bottleneckCandidateV2>;

export const BottleneckAnalysisV2Schema = z.object({
  candidates: z.array(bottleneckCandidateV2).max(3),
  selected_candidate_id: z.string().nullable(),
  selection_reason: z.string(),
  deferred_candidates: z
    .array(z.object({ candidate_id: z.string(), reason: z.string() }))
    .max(3),
  lean_analyst_opinion: z.string(),
});
export type BottleneckAnalysisV2 = z.infer<typeof BottleneckAnalysisV2Schema>;

// ---------------------------------------------------------------------------
// 2.5 RedTeamV2
// ---------------------------------------------------------------------------

export const redTeamVerdictV2 = z.enum(["holds", "revise", "replace", "insufficient_evidence"]);

const alternativeCandidateV2 = z.object({
  statement: z.string(),
  impact: z.string(),
  urgency: z.string(),
});

export const RedTeamV2Schema = z.object({
  verdict: redTeamVerdictV2,
  challenges: z
    .array(
      z.object({
        target_candidate_id: z.string(),
        claim: z.string(),
        evidence_ids: z.array(z.string()).max(20),
        reason: z.string(),
        suggested_resolution: z.string(),
      }),
    )
    .max(10),
  // Server assigns a fresh candidate_id when this is non-null, checked in
  // validate-v2.ts to never collide with an existing candidate id.
  alternative_candidate: alternativeCandidateV2.nullable(),
  counterargument: z.string(),
  revision_note: z.string(),
});
export type RedTeamV2 = z.infer<typeof RedTeamV2Schema>;

// ---------------------------------------------------------------------------
// 2.6 SynthesisV2 / NextExperimentV2
// ---------------------------------------------------------------------------

const actionTypeV2 = z.enum([
  "customer_experiment",
  "technical_test",
  "measurement_setup",
  "operational_fix",
  "clarification",
]);

const measureKindV2 = z.enum(["count", "rate", "continuous", "qualitative", "completion"]);

const metricV2 = z.object({
  name: z.string(),
  definition: z.string(),
  population: z.string().nullable(),
  denominator_definition: z.string().nullable(),
  recording_method: z.string(),
  baseline: z.string().nullable(),
  target_sample: z.number().int().nonnegative().nullable(),
  measure_kind: measureKindV2,
});

const outcomeRulesV2 = z.object({
  supports: z.string(),
  does_not_support: z.string(),
  inconclusive: z.string(),
  incomplete: z.string(),
});

const criteriaStatusV2 = z.enum(["user_provided", "source_supported", "proposed"]);
const feasibilityStatusV2 = z.enum(["fits", "needs_confirmation"]);

/**
 * `review_after_days <= execution_window_days` is a cross-field rule and is
 * enforced in validate-v2.ts, not by these bounds.
 */
export const NextExperimentV2Schema = z.object({
  title: z.string(),
  action_type: actionTypeV2,
  hypothesis: z.string().nullable(),
  decision_to_inform: z.string(),
  target_and_recruitment: z.string(),
  method: z.array(z.string()).min(1).max(8),
  execution_window_days: z.number().int().min(1).max(14),
  review_after_days: z.number().int().min(1),
  observation_window_days: z.number().int().nonnegative().nullable(),
  observation_end_condition: z.string().nullable(),
  timing_reason: z.string(),
  metric: metricV2,
  verification_method: z.string(),
  success_criteria: z.array(z.string()).min(1).max(4),
  criteria_basis: z.string(),
  criteria_status: criteriaStatusV2,
  outcome_rules: outcomeRulesV2,
  stop_condition: z.string(),
  estimated_hours: z.number().nonnegative().nullable(),
  estimated_cost: z.object({
    amount: z.number().nonnegative().nullable(),
    currency: z.string().nullable(),
  }),
  feasibility_status: feasibilityStatusV2,
  unresolved_constraints: z.array(z.string()).max(20),
  limitations: z.array(z.string()).max(20),
});
export type NextExperimentV2 = z.infer<typeof NextExperimentV2Schema>;

const reviewResolutionV2 = z.object({
  item: z.string(),
  resolution: z.enum(["accepted", "rejected", "unresolved"]),
  reason: z.string(),
});

/**
 * `bottleneck_tags` stays `z.array(z.string())`, not a `z.enum` over the
 * allowed tag list, for the same reason as v1 (see schemas.ts): one
 * unrecognised value would fail the whole call over a spelling. The allowed
 * set (BOTTLENECK_TAG_VALUES_V2) is enumerated in the prompt and enforced in
 * validate-v2.ts, where unknown tags are dropped rather than rejected.
 */
export const SynthesisV2Schema = z.object({
  schema_version: z.literal(2),
  current_stage: growthStage.nullable(),
  stage_status: stageStatusV2,
  readiness: z.array(readinessItemV2).max(6),
  diagnosis_status: diagnosisStatusV2,
  critical_bottleneck: z.string(),
  bottleneck_reason: z.string(),
  evidence_gap: z.string().nullable(),
  supporting_evidence_ids: z.array(z.string()).max(30),
  missing_evidence: z
    .array(z.object({ label: z.string(), why_it_matters: z.string() }))
    .max(20),
  bottleneck_tags: z.array(z.string()).max(3),
  lean_analyst_opinion: z.string(),
  red_team_counterargument: z.string(),
  review_resolution: z.array(reviewResolutionV2).max(20),
  next_experiment: NextExperimentV2Schema,
});
export type SynthesisV2 = z.infer<typeof SynthesisV2Schema>;

// ---------------------------------------------------------------------------
// 2.7 ResourceSelectionV2 — model-output half only.
//
// `lookup_status` / `retrieval_mode` / `candidates` / `excluded_reasons` are
// produced by the retrieval layer (Stage 3 work, src/lib/diagnosis/service.ts)
// before the model ever runs — the model never emits `lookup_failed`; the
// server returns that state without a model call at all (prompt doc §9).
// ---------------------------------------------------------------------------

export const resourceSelectionStatusV2 = z.enum([
  "available",
  "not_needed",
  "no_match",
  "needs_verification",
]);

const resourcePickV2 = z.object({
  number: z.number().int().min(1),
  reason: z.string(),
  action_step: z.string(),
  conditions_to_confirm: z.array(z.string()).max(10),
});

export const ResourceSelectionV2Schema = z.object({
  strategy: z.string(),
  status: resourceSelectionStatusV2,
  picks: z.array(resourcePickV2).max(5),
  empty_reason: z.string().nullable(),
});
export type ResourceSelectionV2 = z.infer<typeof ResourceSelectionV2Schema>;

/** Server-side-only outcome, not produced by the model — see comment above. */
export type ResourceLookupStatus = "ok" | "failed";
export type ResourceRetrievalMode = "tag" | "expanded" | "none";

// ---------------------------------------------------------------------------
// Experiment result input (prompt doc §3.C, migration 0004's experiment_runs)
// — founder-submitted, validated with real per-field limits instead of a
// silent 4,000-char truncation. Never sent to a model; this is a plain
// server-input schema, same category as TechnicalContextSchema above.
// ---------------------------------------------------------------------------

export const executionStatusV2 = z.enum(["not_started", "in_progress", "completed", "stopped"]);
export const experimentOutcomeV2 = z.enum([
  "supports",
  "does_not_support",
  "inconclusive",
  "incomplete",
]);

export const ExperimentResultInputSchema = z.object({
  executionStatus: executionStatusV2,
  // The founder's own read against the original outcome_rules — a claim, not
  // a system-verified fact (see ExperimentOutcome's doc comment in database.ts).
  outcome: experimentOutcomeV2.nullable(),
  observedResult: z.string().trim().min(1, "실제로 관찰한 내용을 적어 주세요.").max(4000),
  interpretation: z.string().trim().max(2000).nullable(),
  newConcern: z.string().trim().max(2000).nullable(),
  evidenceRefs: z.array(z.string().trim().max(500)).max(10),
  idempotencyKey: z.uuid(),
});
export type ExperimentResultInput = z.infer<typeof ExperimentResultInputSchema>;
