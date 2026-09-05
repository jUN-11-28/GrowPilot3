import "server-only";

import { getAIProvider, type InlineFile } from "@/lib/ai/provider";
import { geminiModel } from "@/lib/env";
import type { DiagnosisContextV2 } from "@/lib/ai/context-v2";
import {
  BottleneckAnalysisV2Schema,
  EvidenceAnalysisV2Schema,
  RedTeamV2Schema,
  ResourceSelectionV2Schema,
  StageDiagnosisV2Schema,
  SynthesisV2Schema,
  type BottleneckAnalysisV2,
  type EvidenceAnalysisV2,
  type RedTeamV2,
  type ResourceSelectionV2,
  type StageDiagnosisV2,
  type SynthesisV2,
} from "@/lib/ai/schemas-v2";
import { buildEvidencePromptV2, evidenceSystemV2 } from "@/lib/ai/prompts/evidence-v2";
import { buildStagePromptV2, stageSystemV2 } from "@/lib/ai/prompts/stage-v2";
import { bottleneckSystemV2, buildBottleneckPromptV2 } from "@/lib/ai/prompts/bottleneck-v2";
import { buildRedTeamPromptV2, redTeamSystemV2 } from "@/lib/ai/prompts/red-team-v2";
import { buildSynthesizerPromptV2, synthesizerSystemV2 } from "@/lib/ai/prompts/synthesizer-v2";
import { buildResourcePromptV2, resourceSystemV2 } from "@/lib/ai/prompts/resource-v2";
import {
  assertNoIssues,
  checkBottleneckReferences,
  checkReadinessEvidenceReferences,
  checkRedTeamReferences,
  checkSynthesisReferences,
  filterKnownBottleneckTags,
  knownEvidenceIds,
  normalizeEvidenceIds,
  resolveResourcePicks,
  validateNextExperimentTiming,
  validateReadinessScope,
  type V2ValidationIssue,
} from "@/lib/ai/validate-v2";
import { BOTTLENECK_TAG_VALUES_V2, MAX_RECOMMENDED_RESOURCES } from "@/lib/domain/constants";
import type { ResourceSearchResultV2 } from "@/lib/diagnosis/service";
import type { PipelineStep } from "@/lib/ai/steps";
import type { GrowthStage } from "@/lib/types/database";
import type { ResourceLookupStatus, ResourceRetrievalMode } from "@/lib/ai/schemas-v2";

export { PIPELINE_STEPS, STEP_LABEL, type PipelineStep } from "@/lib/ai/steps";

/** Bumped whenever a prompt or the shared v2 rules change meaning, not wording. */
export const PROMPT_VERSION_V2 = "growpilot-v2.2026-1";

export type ResourceSearchV2 = (query: {
  tags: string[];
  stage: GrowthStage | null;
}) => Promise<ResourceSearchResultV2>;

/**
 * Only `available_evidence`/`resource-picks`/`bottleneck_tags` shapes actually
 * used by the trace/report. Not the full model schema — that lives in
 * schemas-v2.ts.
 */
export interface ResourceTraceV2 {
  strategy: string;
  status: ResourceSelectionV2["status"] | "lookup_failed";
  picks: { resource_id: string; reason: string; action_step: string; conditions_to_confirm: string[] }[];
  empty_reason: string | null;
  lookup_status: ResourceLookupStatus;
  retrieval_mode: ResourceRetrievalMode;
  candidate_count: number;
}

export interface AgentTraceV2 {
  evidence: EvidenceAnalysisV2;
  stage: StageDiagnosisV2;
  bottleneck: BottleneckAnalysisV2;
  red_team: RedTeamV2;
  synthesis: SynthesisV2;
  resource: ResourceTraceV2;
  prompt_version: string;
  model_version: string;
}

export interface PipelineResultV2 {
  synthesis: SynthesisV2;
  evidence: EvidenceAnalysisV2;
  trace: AgentTraceV2;
  recommendedResourceIds: string[];
  /** Non-fatal issues (dropped tags, dropped resource picks, soft timing notes) kept for logs/trace, not for blocking the save. */
  issues: V2ValidationIssue[];
}

function truncate(text: string, max = 160): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/**
 * v2 pipeline: Evidence → Stage/Readiness → Bottleneck → Red Team →
 * Synthesis → Resource, matching the v1 orchestration shape in pipeline.ts
 * but built on the v2 schemas/prompts/context.
 *
 * Reference-integrity problems (a step referencing an evidence_id or
 * candidate_id that doesn't exist) are fatal — the run throws and the caller
 * (the run route) marks the session failed, same as any other pipeline
 * error. A single automatic repair-and-retry on that failure is Stage 4
 * scope; this function always makes exactly one model call per step.
 *
 * Not called from the live run route by default — see env.ts's
 * `diagnosisSchemaVersion()` and the run route's version branch.
 */
export async function runDiagnosisPipelineV2({
  context,
  searchResources,
  attachmentFiles = [],
  onStep,
}: {
  context: DiagnosisContextV2;
  searchResources: ResourceSearchV2;
  attachmentFiles?: InlineFile[];
  onStep?: (step: PipelineStep, phase: "start" | "done", detail?: string) => void | Promise<void>;
}): Promise<PipelineResultV2> {
  const provider = getAIProvider();
  const modelVersion = provider.name === "mock" ? "mock" : geminiModel();
  const issues: V2ValidationIssue[] = [];

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

  const rawEvidence = await run(
    "evidence",
    () =>
      provider.generateStructured({
        kind: "evidence_v2",
        system: evidenceSystemV2,
        prompt: buildEvidencePromptV2(context),
        schema: EvidenceAnalysisV2Schema,
        files: attachmentFiles,
      }),
    (v) => v.summary,
  );
  // The model invents evidence_id per-call; every later step must see the
  // same canonical ids, so this runs immediately and nothing downstream ever
  // touches rawEvidence.available_evidence[].evidence_id again.
  const { evidence } = normalizeEvidenceIds(rawEvidence);
  const knownIds = knownEvidenceIds(evidence);

  const stage = await run(
    "stage",
    () =>
      provider.generateStructured({
        kind: "stage_v2",
        system: stageSystemV2,
        prompt: buildStagePromptV2(context, evidence),
        schema: StageDiagnosisV2Schema,
      }),
    (v) => v.reasoning,
  );
  issues.push(...validateReadinessScope(stage.readiness));
  assertNoIssues(checkReadinessEvidenceReferences(stage.readiness, knownIds));

  const bottleneck = await run(
    "bottleneck",
    () =>
      provider.generateStructured({
        kind: "bottleneck_v2",
        system: bottleneckSystemV2,
        prompt: buildBottleneckPromptV2(context, evidence, stage),
        schema: BottleneckAnalysisV2Schema,
      }),
    (v) => v.selection_reason,
  );
  assertNoIssues(checkBottleneckReferences(bottleneck, knownIds));
  const candidateIds = new Set(bottleneck.candidates.map((c) => c.candidate_id));

  const redTeam = await run(
    "red_team",
    () =>
      provider.generateStructured({
        kind: "red_team_v2",
        system: redTeamSystemV2,
        prompt: buildRedTeamPromptV2(context, evidence, stage, bottleneck),
        schema: RedTeamV2Schema,
      }),
    (v) => v.counterargument,
  );
  assertNoIssues(checkRedTeamReferences(redTeam, candidateIds));

  const synthesis = await run(
    "synthesis",
    () =>
      provider.generateStructured({
        kind: "synthesis_v2",
        system: synthesizerSystemV2,
        prompt: buildSynthesizerPromptV2(context, evidence, stage, bottleneck, redTeam),
        schema: SynthesisV2Schema,
        maxTokens: 16000,
      }),
    (v) => v.critical_bottleneck,
  );
  assertNoIssues(checkSynthesisReferences(synthesis, knownIds));
  issues.push(...validateNextExperimentTiming(synthesis.next_experiment));

  const { kept: keptTags, dropped: droppedTags } = filterKnownBottleneckTags(
    synthesis.bottleneck_tags,
    new Set<string>(BOTTLENECK_TAG_VALUES_V2),
  );
  if (droppedTags.length > 0) {
    issues.push({
      path: "bottleneck_tags",
      code: "unknown_bottleneck_tag",
      message: `허용되지 않은 병목 태그를 제외했습니다: ${droppedTags.join(", ")}`,
    });
  }

  // Resource retrieval happens here, against the *confirmed* bottleneck's
  // tags — same ordering rationale as v1 (see pipeline.ts).
  const searchResult = await searchResources({ tags: keptTags, stage: synthesis.current_stage });
  const { candidates, lookupStatus, retrievalMode, excludedReasons } = searchResult;
  if (lookupStatus === "failed") {
    issues.push({
      path: "resource",
      code: "resource_lookup_failed",
      message: excludedReasons.join("; ") || "자원 조회 중 알 수 없는 오류",
    });
  } else if (excludedReasons.length > 0) {
    issues.push(
      ...excludedReasons.map((message) => ({ path: "resource", code: "resource_search_note", message })),
    );
  }

  let resourceTrace: ResourceTraceV2;
  let recommendedResourceIds: string[] = [];

  if (lookupStatus === "failed") {
    resourceTrace = {
      strategy: "",
      status: "lookup_failed",
      picks: [],
      empty_reason: null,
      lookup_status: "failed",
      retrieval_mode: retrievalMode,
      candidate_count: 0,
    };
  } else if (candidates.length === 0) {
    // Nothing to choose from — this is a deterministic outcome, not a model
    // judgment call, so no model call is made (prompt doc §9).
    resourceTrace = {
      strategy: "",
      status: "no_match",
      picks: [],
      empty_reason: "이번 행동에 맞는 자원을 찾지 못했습니다.",
      lookup_status: "ok",
      retrieval_mode: retrievalMode,
      candidate_count: 0,
    };
  } else {
    const selection = await run(
      "resource",
      () =>
        provider.generateStructured({
          kind: "resource_v2",
          system: resourceSystemV2,
          prompt: buildResourcePromptV2(context, synthesis, candidates),
          schema: ResourceSelectionV2Schema,
          effort: "low",
        }),
      (v) => v.strategy,
    );
    const { resolved, droppedCount } = resolveResourcePicks(
      selection.picks,
      candidates,
      (c) => c.id,
      MAX_RECOMMENDED_RESOURCES,
    );
    if (droppedCount > 0) {
      issues.push({
        path: "resource.picks",
        code: "invalid_resource_pick",
        message: `범위를 벗어나거나 중복된 자원 선택 ${droppedCount}건을 제외했습니다.`,
      });
    }
    recommendedResourceIds = resolved.map((r) => r.candidate.id);
    resourceTrace = {
      strategy: selection.strategy,
      status: selection.status,
      picks: resolved.map((r) => ({
        resource_id: r.candidate.id,
        reason: r.reason,
        action_step: r.action_step,
        conditions_to_confirm: r.conditions_to_confirm,
      })),
      empty_reason: selection.empty_reason,
      lookup_status: "ok",
      retrieval_mode: retrievalMode,
      candidate_count: candidates.length,
    };
  }

  return {
    synthesis,
    evidence,
    trace: {
      evidence,
      stage,
      bottleneck,
      red_team: redTeam,
      synthesis,
      resource: resourceTrace,
      prompt_version: PROMPT_VERSION_V2,
      model_version: modelVersion,
    },
    recommendedResourceIds,
    issues,
  };
}
