import "server-only";

import { getAIProvider, type InlineFile } from "@/lib/ai/provider";
import type { DiagnosisContext } from "@/lib/ai/context";
import {
  BottleneckAnalysisSchema,
  EvidenceAnalysisSchema,
  RedTeamSchema,
  ResourceSelectionSchema,
  StageDiagnosisSchema,
  SynthesisSchema,
  type BottleneckAnalysis,
  type EvidenceAnalysis,
  type RedTeamReview,
  type StageDiagnosis,
  type Synthesis,
} from "@/lib/ai/schemas";
import { buildEvidencePrompt, evidenceSystem } from "@/lib/ai/prompts/evidence";
import { buildStagePrompt, stageSystem } from "@/lib/ai/prompts/stage";
import {
  bottleneckSystem,
  buildBottleneckPrompt,
} from "@/lib/ai/prompts/bottleneck";
import { buildRedTeamPrompt, redTeamSystem } from "@/lib/ai/prompts/red-team";
import {
  buildSynthesizerPrompt,
  synthesizerSystem,
} from "@/lib/ai/prompts/synthesizer";
import { buildResourcePrompt, resourceSystem } from "@/lib/ai/prompts/resource";
import { buildPriorityHint } from "@/lib/domain/bottleneck";
import {
  BOTTLENECK_TAG_VALUES,
  MAX_RECOMMENDED_RESOURCES,
} from "@/lib/domain/constants";
import type { PipelineStep } from "@/lib/ai/steps";
import type { BottleneckTag } from "@/lib/domain/constants";
import type { GrowthStage, ResourceRow } from "@/lib/types/database";

export { PIPELINE_STEPS, STEP_LABEL, type PipelineStep } from "@/lib/ai/steps";

/**
 * Every role's raw output, stored on the result row. This is what the report's
 * AI C-Level Board renders — the board is a view of these five, not a sixth
 * analysis of its own.
 */
export interface ResourceTrace {
  strategy: string;
  /** Reasons keyed by resource id, so the report can pair each pick with its why. */
  picks: { resource_id: string; reason: string }[];
  /** How many rows the bottleneck-tag search returned before the model chose. */
  candidate_count: number;
}

export interface AgentTrace {
  evidence: EvidenceAnalysis;
  stage: StageDiagnosis;
  bottleneck: BottleneckAnalysis;
  red_team: RedTeamReview;
  synthesis: Synthesis;
  resource: ResourceTrace;
}

export interface PipelineResult {
  synthesis: Synthesis;
  trace: AgentTrace;
  recommendedResourceIds: string[];
}

/** Retrieval hook: resources are searched by the *confirmed* bottleneck's tags. */
export type ResourceSearch = (query: {
  tags: BottleneckTag[];
  stage: GrowthStage;
}) => Promise<ResourceRow[]>;

/** Keeps the live progress feed to one short line per agent. */
function truncate(text: string, max = 160): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/**
 * Evidence → Stage → Bottleneck → Red Team → Strategy Synthesizer → Resource.
 *
 * The Resource Agent runs *after* the synthesizer, not before it: the brief
 * defines its job as searching for resources that solve the **confirmed**
 * bottleneck, and the bottleneck is only confirmed once the synthesizer has
 * reconciled the analyst with the red team.
 *
 * Deliberately a plain sequential function: each role is an isolated
 * prompt + schema, and the orchestration is readable top to bottom.
 */
export async function runDiagnosisPipeline({
  context,
  searchResources,
  attachmentFiles = [],
  onStep,
}: {
  context: DiagnosisContext;
  searchResources: ResourceSearch;
  /** Uploaded attachments, read only by the Evidence Agent. */
  attachmentFiles?: InlineFile[];
  onStep?: (
    step: PipelineStep,
    phase: "start" | "done",
    detail?: string,
  ) => void | Promise<void>;
}): Promise<PipelineResult> {
  const provider = getAIProvider();

  const run = async <T>(
    step: PipelineStep,
    fn: () => Promise<T>,
    detailOf?: (value: T) => string,
  ): Promise<T> => {
    await onStep?.(step, "start");
    const value = await fn();
    await onStep?.(step, "done", detailOf ? truncate(detailOf(value)) : undefined);
    return value;
  };

  const evidence = await run(
    "evidence",
    () =>
      provider.generateStructured({
        kind: "evidence",
        system: evidenceSystem,
        prompt: buildEvidencePrompt(context),
        schema: EvidenceAnalysisSchema,
        files: attachmentFiles,
      }),
    (v) => v.summary,
  );

  const stage = await run(
    "stage",
    () =>
      provider.generateStructured({
        kind: "stage",
        system: stageSystem,
        prompt: buildStagePrompt(context, evidence),
        schema: StageDiagnosisSchema,
      }),
    (v) => v.reasoning,
  );

  const bottleneck = await run(
    "bottleneck",
    () =>
      provider.generateStructured({
        kind: "bottleneck",
        system: bottleneckSystem,
        prompt: buildBottleneckPrompt(context, evidence, stage, buildPriorityHint(stage)),
        schema: BottleneckAnalysisSchema,
      }),
    (v) => v.critical_bottleneck.statement,
  );

  const redTeam = await run(
    "red_team",
    () =>
      provider.generateStructured({
        kind: "red_team",
        system: redTeamSystem,
        prompt: buildRedTeamPrompt(context, stage, bottleneck),
        schema: RedTeamSchema,
      }),
    (v) => v.counterargument,
  );

  const synthesis = await run(
    "synthesis",
    () =>
      provider.generateStructured({
        kind: "synthesis",
        system: synthesizerSystem,
        prompt: buildSynthesizerPrompt(context, evidence, stage, bottleneck, redTeam),
        schema: SynthesisSchema,
        maxTokens: 16000,
      }),
    (v) => v.critical_bottleneck,
  );

  // Retrieval happens here, with the confirmed bottleneck's tags as the query —
  // never against the founder's profile or the whole catalogue. Tags the
  // catalogue doesn't use are dropped; the search widens rather than failing.
  const known = new Set<string>(BOTTLENECK_TAG_VALUES);
  const candidates = await searchResources({
    tags: synthesis.bottleneck_tags.filter((tag): tag is BottleneckTag =>
      known.has(tag),
    ),
    stage: synthesis.current_stage,
  });

  const selection = await run(
    "resource",
    () =>
      provider.generateStructured({
        kind: "resource",
        system: resourceSystem,
        prompt: buildResourcePrompt(context, synthesis, candidates),
        schema: ResourceSelectionSchema,
        effort: "low",
      }),
    (v) => v.strategy,
  );

  // The model picks list positions, never ids — an out-of-range pick is
  // dropped instead of producing a dangling reference.
  const seen = new Set<string>();
  const picks: ResourceTrace["picks"] = [];
  for (const pick of selection.picks) {
    const resource = candidates[pick.number - 1];
    if (!resource || seen.has(resource.id)) continue;
    seen.add(resource.id);
    picks.push({ resource_id: resource.id, reason: pick.reason });
    if (picks.length === MAX_RECOMMENDED_RESOURCES) break;
  }

  return {
    synthesis,
    trace: {
      evidence,
      stage,
      bottleneck,
      red_team: redTeam,
      // Kept whole so fields the result columns don't carry (evidence_gap,
      // bottleneck_tags) survive for the report to render.
      synthesis,
      resource: {
        strategy: selection.strategy,
        picks,
        candidate_count: candidates.length,
      },
    },
    recommendedResourceIds: picks.map((pick) => pick.resource_id),
  };
}
