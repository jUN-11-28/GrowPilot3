import { z } from "zod";
import type { Json } from "@/lib/types/database";

/**
 * Read-side schemas for v2 JSONB (`diagnosis_results.report_v2` and, once
 * schema_version=2, `diagnosis_results.agent_trace`).
 *
 * Same discipline as trace.ts's v1 `AgentTraceViewSchema`: fully optional and
 * never thrown from `parse*` — a v2 report written by a later prompt/schema
 * revision than the one currently deployed must still render whatever fields
 * it recognises instead of showing nothing. This file has no callers yet
 * (nothing writes `report_v2` until Stage 2); it exists now so the read
 * contract for v2 rows is fixed before anything produces them.
 */

const sourceRefView = z.object({
  source_id: z.string(),
  locator: z.string().nullable().optional(),
  excerpt: z.string().nullable().optional(),
  locator_status: z.string().optional(),
});

const evidenceViewV2 = z.object({
  available_evidence: z
    .array(
      z.object({
        evidence_id: z.string(),
        claim: z.string(),
        source_refs: z.array(sourceRefView).optional(),
        provenance: z.string().optional(),
        evidence_domain: z.string().optional(),
        observation_kind: z.string().optional(),
        period: z.string().nullable().optional(),
        population: z.string().nullable().optional(),
        sample_size: z.number().nullable().optional(),
        supports: z.string().optional(),
        does_not_establish: z.string().optional(),
        limitations: z.string().optional(),
      }),
    )
    .optional(),
  unverified_hypotheses: z
    .array(z.object({ statement: z.string(), why_unverified: z.string().optional() }))
    .optional(),
  missing_evidence: z
    .array(
      z.object({
        label: z.string(),
        why_it_matters: z.string().optional(),
        availability: z.string().optional(),
      }),
    )
    .optional(),
  conflicts: z
    .array(
      z.object({
        evidence_ids: z.array(z.string()).optional(),
        description: z.string(),
        needed_resolution: z.string().optional(),
      }),
    )
    .optional(),
  summary: z.string().optional(),
  coverage_limitations: z.array(z.string()).optional(),
});

const readinessItemView = z.object({
  dimension: z.string(),
  status: z.string(),
  supporting_evidence_ids: z.array(z.string()).optional(),
  contradicting_evidence_ids: z.array(z.string()).optional(),
  missing_information: z.array(z.string()).optional(),
  scope: z.string().nullable().optional(),
});

const stageViewV2 = z.object({
  current_stage: z.string().nullable().optional(),
  stage_status: z.string().optional(),
  reasoning: z.string().optional(),
  limitations: z.array(z.string()).optional(),
  readiness: z.array(readinessItemView).optional(),
});

const bottleneckViewV2 = z.object({
  candidates: z
    .array(
      z.object({
        candidate_id: z.string(),
        statement: z.string(),
        diagnosis_status: z.string().optional(),
        impact: z.string().optional(),
        urgency: z.string().optional(),
        priority_reason: z.string().optional(),
      }),
    )
    .optional(),
  selected_candidate_id: z.string().nullable().optional(),
  selection_reason: z.string().optional(),
  lean_analyst_opinion: z.string().optional(),
});

const redTeamViewV2 = z.object({
  verdict: z.string().optional(),
  challenges: z
    .array(
      z.object({
        target_candidate_id: z.string().optional(),
        claim: z.string(),
        reason: z.string().optional(),
        suggested_resolution: z.string().optional(),
      }),
    )
    .optional(),
  alternative_candidate: z
    .object({ statement: z.string(), impact: z.string().optional(), urgency: z.string().optional() })
    .nullable()
    .optional(),
  counterargument: z.string().optional(),
  revision_note: z.string().optional(),
});

const metricView = z.object({
  name: z.string(),
  definition: z.string().optional(),
  population: z.string().nullable().optional(),
  denominator_definition: z.string().nullable().optional(),
  recording_method: z.string().optional(),
  baseline: z.string().nullable().optional(),
  target_sample: z.number().nullable().optional(),
  measure_kind: z.string().optional(),
});

const nextExperimentViewV2 = z.object({
  title: z.string(),
  action_type: z.string().optional(),
  hypothesis: z.string().nullable().optional(),
  decision_to_inform: z.string().optional(),
  target_and_recruitment: z.string().optional(),
  method: z.array(z.string()).optional(),
  execution_window_days: z.number().optional(),
  review_after_days: z.number().optional(),
  observation_window_days: z.number().nullable().optional(),
  observation_end_condition: z.string().nullable().optional(),
  timing_reason: z.string().optional(),
  metric: metricView.optional(),
  verification_method: z.string().optional(),
  success_criteria: z.array(z.string()).optional(),
  criteria_basis: z.string().optional(),
  criteria_status: z.string().optional(),
  outcome_rules: z
    .object({
      supports: z.string(),
      does_not_support: z.string(),
      inconclusive: z.string(),
      incomplete: z.string(),
    })
    .optional(),
  stop_condition: z.string().optional(),
  estimated_hours: z.number().nullable().optional(),
  estimated_cost: z
    .object({ amount: z.number().nullable().optional(), currency: z.string().nullable().optional() })
    .optional(),
  feasibility_status: z.string().optional(),
  unresolved_constraints: z.array(z.string()).optional(),
  limitations: z.array(z.string()).optional(),
});

const resourceViewV2 = z.object({
  strategy: z.string().optional(),
  status: z.string().optional(),
  picks: z
    .array(
      z.object({
        resource_id: z.string().optional(),
        reason: z.string(),
        action_step: z.string().optional(),
        conditions_to_confirm: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  empty_reason: z.string().nullable().optional(),
  lookup_status: z.string().optional(),
  retrieval_mode: z.string().optional(),
  candidate_count: z.number().optional(),
});

/** `diagnosis_results.report_v2` — the canonical SynthesisV2 for the report. */
export const ReportV2ViewSchema = z.object({
  schema_version: z.literal(2).optional(),
  current_stage: z.string().nullable().optional(),
  stage_status: z.string().optional(),
  readiness: z.array(readinessItemView).optional(),
  diagnosis_status: z.string().optional(),
  critical_bottleneck: z.string().optional(),
  bottleneck_reason: z.string().optional(),
  evidence_gap: z.string().nullable().optional(),
  supporting_evidence_ids: z.array(z.string()).optional(),
  missing_evidence: z
    .array(z.object({ label: z.string(), why_it_matters: z.string().optional() }))
    .optional(),
  bottleneck_tags: z.array(z.string()).optional(),
  lean_analyst_opinion: z.string().optional(),
  red_team_counterargument: z.string().optional(),
  review_resolution: z
    .array(z.object({ item: z.string(), resolution: z.string(), reason: z.string().optional() }))
    .optional(),
  next_experiment: nextExperimentViewV2.optional(),
});
export type ReportV2View = z.infer<typeof ReportV2ViewSchema>;

export function parseReportV2(value: Json): ReportV2View | null {
  if (value === null) return null;
  const parsed = ReportV2ViewSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** `diagnosis_results.agent_trace` when `schema_version = 2`. */
export const AgentTraceV2ViewSchema = z.object({
  evidence: evidenceViewV2.optional(),
  stage: stageViewV2.optional(),
  bottleneck: bottleneckViewV2.optional(),
  red_team: redTeamViewV2.optional(),
  synthesis: ReportV2ViewSchema.optional(),
  resource: resourceViewV2.optional(),
  prompt_version: z.string().optional(),
  model_version: z.string().optional(),
});
export type AgentTraceV2View = z.infer<typeof AgentTraceV2ViewSchema>;

export function parseAgentTraceV2(value: Json): AgentTraceV2View {
  const parsed = AgentTraceV2ViewSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}
