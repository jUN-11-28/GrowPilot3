import { z } from "zod";
import type { Json } from "@/lib/types/database";

/**
 * Read-side schema for `diagnosis_results.agent_trace`.
 *
 * Deliberately separate from the generation schemas in `schemas.ts` and fully
 * optional: a trace is written by whatever version of the pipeline produced it,
 * and opening an old report must never throw because a field was added later.
 * Anything missing is simply not rendered.
 */
const evidenceView = z.object({
  summary: z.string().optional(),
  evidence_confidence: z.number().optional(),
  available_evidence: z
    .array(
      z.object({
        label: z.string(),
        summary: z.string(),
        strength: z.string().optional(),
      }),
    )
    .optional(),
  unverified_hypotheses: z
    .array(z.object({ statement: z.string(), why_unverified: z.string().optional() }))
    .optional(),
  missing_evidence: z
    .array(z.object({ label: z.string(), why_it_matters: z.string().optional() }))
    .optional(),
});

const stageView = z.object({
  current_stage: z.string().optional(),
  stage_confidence: z.number().optional(),
  reasoning: z.string().optional(),
  unmet_prerequisites: z
    .array(z.object({ stage: z.string(), missing: z.string() }))
    .optional(),
});

const bottleneckView = z.object({
  candidates: z
    .array(
      z.object({
        statement: z.string(),
        stage: z.string().optional(),
        why_blocking: z.string().optional(),
        evidence_gap: z.string().optional(),
      }),
    )
    .optional(),
  critical_bottleneck: z
    .object({ statement: z.string(), evidence_gap: z.string().optional() })
    .optional(),
  lean_analyst_opinion: z.string().optional(),
});

const redTeamView = z.object({
  counterargument: z.string().optional(),
  challenged_assumptions: z.array(z.string()).optional(),
  alternative_bottleneck: z.string().optional(),
  verdict: z.enum(["holds", "revise", "replace"]).optional(),
  revision_note: z.string().optional(),
});

const resourceView = z.object({
  strategy: z.string().optional(),
  picks: z
    .array(z.object({ resource_id: z.string(), reason: z.string() }))
    .optional(),
  candidate_count: z.number().optional(),
});

const synthesisView = z.object({
  evidence_gap: z.string().optional(),
  bottleneck_tags: z.array(z.string()).optional(),
});

export const AgentTraceViewSchema = z.object({
  evidence: evidenceView.optional(),
  stage: stageView.optional(),
  bottleneck: bottleneckView.optional(),
  red_team: redTeamView.optional(),
  synthesis: synthesisView.optional(),
  resource: resourceView.optional(),
});

export type AgentTraceView = z.infer<typeof AgentTraceViewSchema>;

export function parseAgentTrace(value: Json): AgentTraceView {
  const parsed = AgentTraceViewSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

export const RED_TEAM_VERDICT_LABEL: Record<
  NonNullable<AgentTraceView["red_team"]>["verdict"] & string,
  string
> = {
  holds: "판단 유지",
  revise: "범위 수정",
  replace: "병목 교체",
};
