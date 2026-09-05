import "server-only";

import type { EvidenceAnalysisV2, SynthesisV2 } from "@/lib/ai/schemas-v2";
import type { GrowthStage, NextExperiment } from "@/lib/types/database";

/**
 * The single place that turns a canonical `SynthesisV2` into the legacy
 * display columns `diagnosis_results` still carries (current_stage,
 * critical_bottleneck, next_experiment, ...) — so old UI and any code that
 * hasn't been migrated to read `report_v2` directly keeps working, and there
 * is exactly one mapping to keep in sync rather than one per caller.
 *
 * Not called anywhere yet: nothing produces a `SynthesisV2` until Stage 2
 * wires the v2 pipeline. It exists now because the *shape* of that mapping is
 * part of the v2 data contract (prompt doc §1.B), independent of when the
 * pipeline that feeds it lands.
 */

export interface LegacyDisplayColumns {
  current_stage: GrowthStage | null;
  stage_confidence: null;
  evidence_confidence: null;
  critical_bottleneck: string;
  bottleneck_reason: string;
  supporting_evidence: string[];
  missing_evidence: string[];
  lean_analyst_opinion: string;
  red_team_counterargument: string;
  next_experiment: NextExperiment;
}

const PROVENANCE_LABEL: Record<string, string> = {
  source_observation: "직접 관찰",
  founder_report: "창업자 보고",
  third_party_report: "제3자 보고",
};

/**
 * "claim (근거: provenance, source_id)" — the legacy column is a flat string
 * array with no room for structured source_refs, so the source level is
 * folded into the string itself rather than dropped.
 */
function describeEvidence(
  evidenceId: string,
  evidenceById: ReadonlyMap<string, EvidenceAnalysisV2["available_evidence"][number]>,
): string {
  const item = evidenceById.get(evidenceId);
  if (!item) return evidenceId;
  const provenance = PROVENANCE_LABEL[item.provenance] ?? item.provenance;
  const sourceIds = item.source_refs.map((ref) => ref.source_id).join(", ") || "출처 미상";
  return `${item.claim} (${provenance} · 출처: ${sourceIds})`;
}

export function buildEvidenceLookup(
  evidence: EvidenceAnalysisV2,
): Map<string, EvidenceAnalysisV2["available_evidence"][number]> {
  return new Map(evidence.available_evidence.map((item) => [item.evidence_id, item]));
}

export function serializeSynthesisV2ToLegacyColumns(
  synthesis: SynthesisV2,
  evidenceById: ReadonlyMap<string, EvidenceAnalysisV2["available_evidence"][number]>,
): LegacyDisplayColumns {
  const { next_experiment } = synthesis;

  const hypothesis =
    next_experiment.hypothesis ??
    `(사전 준비 단계 — 참/거짓을 가릴 가설 없음) 확인할 것: ${next_experiment.decision_to_inform}`;

  return {
    current_stage: synthesis.current_stage,
    stage_confidence: null,
    evidence_confidence: null,
    critical_bottleneck: synthesis.critical_bottleneck,
    bottleneck_reason: synthesis.bottleneck_reason,
    supporting_evidence: synthesis.supporting_evidence_ids.map((id) =>
      describeEvidence(id, evidenceById),
    ),
    missing_evidence: synthesis.missing_evidence.map(
      (item) => `${item.label} — ${item.why_it_matters}`,
    ),
    lean_analyst_opinion: synthesis.lean_analyst_opinion,
    red_team_counterargument: synthesis.red_team_counterargument,
    next_experiment: {
      title: next_experiment.title,
      hypothesis,
      method: next_experiment.method,
      verification_method: next_experiment.verification_method,
      success_criteria: next_experiment.success_criteria,
      stop_condition: next_experiment.stop_condition,
      duration: `${next_experiment.execution_window_days}일`,
    },
  };
}
