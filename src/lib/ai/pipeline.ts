import "server-only";

import { getAIProvider, type InlineFile } from "@/lib/ai/provider";
import type { DiagnosisContext } from "@/lib/ai/context";
import {
  BottleneckAnalysisSchema,
  EvidenceAnalysisSchema,
  RedTeamSchema,
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
import { buildPriorityHint } from "@/lib/domain/bottleneck";
import { MAX_RECOMMENDED_RESOURCES } from "@/lib/domain/constants";
import type { PipelineStep } from "@/lib/ai/steps";
import type { ResourceRow } from "@/lib/types/database";

export { PIPELINE_STEPS, STEP_LABEL, type PipelineStep } from "@/lib/ai/steps";

export interface AgentTrace {
  evidence: EvidenceAnalysis;
  stage: StageDiagnosis;
  bottleneck: BottleneckAnalysis;
  red_team: RedTeamReview;
}

export interface PipelineResult {
  synthesis: Synthesis;
  trace: AgentTrace;
  recommendedResourceIds: string[];
}

/** Keeps the live progress feed to one short line per agent. */
function truncate(text: string, max = 160): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/**
 * User Input → Evidence Analyst → Stage Diagnoser → Bottleneck Analyst
 * → Red Team → Strategy Synthesizer → Final Result.
 *
 * Deliberately a plain sequential function: each role is an isolated
 * prompt + schema, and the orchestration is readable top to bottom.
 */
export async function runDiagnosisPipeline({
  context,
  resources,
  attachmentFiles = [],
  onStep,
}: {
  context: DiagnosisContext;
  resources: ResourceRow[];
  /** Uploaded attachments, read only by the Evidence Analyst. */
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

  const synthesis = await run("synthesis", () =>
    provider.generateStructured({
      kind: "synthesis",
      system: synthesizerSystem,
      prompt: buildSynthesizerPrompt(
        context,
        evidence,
        stage,
        bottleneck,
        redTeam,
        resources,
      ),
      schema: SynthesisSchema,
      maxTokens: 16000,
    }),
  );

  return {
    synthesis,
    trace: { evidence, stage, bottleneck, red_team: redTeam },
    // The model picks list positions, never ids — an out-of-range pick is
    // dropped instead of producing a dangling reference.
    recommendedResourceIds: [
      ...new Set(
        synthesis.recommended_resource_numbers
          .map((n) => resources[n - 1]?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    ].slice(0, MAX_RECOMMENDED_RESOURCES),
  };
}
