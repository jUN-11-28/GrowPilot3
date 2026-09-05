import "server-only";

import type {
  BottleneckAnalysisV2,
  EvidenceAnalysisV2,
  ReadinessItemV2,
  RedTeamV2,
  ResourceSelectionV2,
  SourceManifestEntry,
  SourceRefV2,
  SynthesisV2,
} from "@/lib/ai/schemas-v2";

/**
 * Semantic checks the v2 model schemas cannot express (schemas-v2.ts explains
 * why). Every function here is pure and non-throwing on its own — callers
 * collect `V2ValidationIssue[]` across a whole step and decide what to do
 * (repair-and-retry once, fail the run, or — for the drop-and-widen cases
 * that mirror v1 precedent — just proceed with the cleaned value).
 *
 * Nothing in this module is wired into the pipeline yet (that is Stage 2's
 * job); it exists now so the v2 contract has one place that enforces it
 * consistently, and so it can be unit-tested independently of any model call.
 */

export interface V2ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export class V2ValidationError extends Error {
  constructor(readonly issues: V2ValidationIssue[]) {
    super(
      `v2 결과가 의미 검증을 통과하지 못했습니다: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
    );
    this.name = "V2ValidationError";
  }
}

export function assertNoIssues(issues: V2ValidationIssue[]): void {
  if (issues.length > 0) throw new V2ValidationError(issues);
}

// ---------------------------------------------------------------------------
// Evidence id normalization
//
// The model invents `evidence_id` values scoped only to its own response. The
// server re-keys them to ids that are unique for the whole diagnosis run and
// hands back a map so the exact string the model used can still be found in
// logs. Every later step must be given the *normalized* evidence (and must
// never see the model's original ids), so a downstream reference can always
// be checked against a single canonical id set.
// ---------------------------------------------------------------------------

export function normalizeEvidenceIds(evidence: EvidenceAnalysisV2): {
  evidence: EvidenceAnalysisV2;
  idMap: Map<string, string>;
} {
  const idMap = new Map<string, string>();
  let counter = 0;

  const canonicalize = (originalId: string): string => {
    const existing = idMap.get(originalId);
    if (existing) return existing;
    counter += 1;
    const canonical = `ev_${counter}`;
    idMap.set(originalId, canonical);
    return canonical;
  };

  const available_evidence = evidence.available_evidence.map((item) => ({
    ...item,
    evidence_id: canonicalize(item.evidence_id),
  }));

  return { evidence: { ...evidence, available_evidence }, idMap };
}

/** All canonical evidence ids a later step is allowed to reference. */
export function knownEvidenceIds(evidence: EvidenceAnalysisV2): Set<string> {
  return new Set(evidence.available_evidence.map((item) => item.evidence_id));
}

/**
 * Checks a list of evidence-id references (e.g. `readiness[].supporting_evidence_ids`)
 * against the known set. Returns the issues found — it does not mutate or
 * drop anything, because dropping a dangling evidence reference silently
 * would hide a model error the spec requires surfacing (§2.10 rule 1).
 */
export function checkEvidenceIdReferences(
  path: string,
  ids: readonly string[],
  known: ReadonlySet<string>,
): V2ValidationIssue[] {
  return ids
    .filter((id) => !known.has(id))
    .map((id) => ({
      path,
      code: "unknown_evidence_id",
      message: `존재하지 않는 evidence_id를 참조했습니다: ${id}`,
    }));
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

/** `not_applicable` must carry a reason in `scope` — prompt doc §2.3. */
export function validateReadinessScope(readiness: readonly ReadinessItemV2[]): V2ValidationIssue[] {
  return readiness
    .filter((item) => item.status === "not_applicable" && !item.scope?.trim())
    .map((item) => ({
      path: `readiness.${item.dimension}.scope`,
      code: "missing_not_applicable_scope",
      message: "not_applicable 상태에는 사업 특성상 적용되지 않는 이유(scope)가 필요합니다.",
    }));
}

export function checkReadinessEvidenceReferences(
  readiness: readonly ReadinessItemV2[],
  known: ReadonlySet<string>,
): V2ValidationIssue[] {
  return readiness.flatMap((item) => [
    ...checkEvidenceIdReferences(
      `readiness.${item.dimension}.supporting_evidence_ids`,
      item.supporting_evidence_ids,
      known,
    ),
    ...checkEvidenceIdReferences(
      `readiness.${item.dimension}.contradicting_evidence_ids`,
      item.contradicting_evidence_ids,
      known,
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Bottleneck candidates
// ---------------------------------------------------------------------------

export function checkBottleneckReferences(
  bottleneck: BottleneckAnalysisV2,
  known: ReadonlySet<string>,
): V2ValidationIssue[] {
  const candidateIds = new Set(bottleneck.candidates.map((c) => c.candidate_id));
  const issues: V2ValidationIssue[] = [];

  if (bottleneck.selected_candidate_id !== null && !candidateIds.has(bottleneck.selected_candidate_id)) {
    issues.push({
      path: "selected_candidate_id",
      code: "unknown_candidate_id",
      message: `candidates에 없는 candidate_id를 선택했습니다: ${bottleneck.selected_candidate_id}`,
    });
  }

  for (const deferred of bottleneck.deferred_candidates) {
    if (!candidateIds.has(deferred.candidate_id)) {
      issues.push({
        path: "deferred_candidates",
        code: "unknown_candidate_id",
        message: `candidates에 없는 candidate_id를 보류 처리했습니다: ${deferred.candidate_id}`,
      });
    }
  }

  for (const candidate of bottleneck.candidates) {
    issues.push(
      ...checkEvidenceIdReferences(
        `candidates.${candidate.candidate_id}.supporting_evidence_ids`,
        candidate.supporting_evidence_ids,
        known,
      ),
      ...checkEvidenceIdReferences(
        `candidates.${candidate.candidate_id}.opposing_evidence_ids`,
        candidate.opposing_evidence_ids,
        known,
      ),
    );
  }

  return issues;
}

/**
 * Red Team references bottleneck candidate ids and may propose one new
 * alternative candidate. Since the model cannot know ids used elsewhere, the
 * server assigns the alternative a fresh id here rather than trusting one
 * from the model (there isn't one in the schema — see schemas-v2.ts).
 */
export function checkRedTeamReferences(
  redTeam: RedTeamV2,
  candidateIds: ReadonlySet<string>,
): V2ValidationIssue[] {
  return redTeam.challenges
    .filter((c) => !candidateIds.has(c.target_candidate_id))
    .map((c) => ({
      path: "challenges.target_candidate_id",
      code: "unknown_candidate_id",
      message: `candidates에 없는 candidate_id를 반박했습니다: ${c.target_candidate_id}`,
    }));
}

export function assignAlternativeCandidateId(existingIds: ReadonlySet<string>): string {
  let n = 1;
  while (existingIds.has(`alt_${n}`)) n += 1;
  return `alt_${n}`;
}

// ---------------------------------------------------------------------------
// Bottleneck tags — drop-and-widen, mirroring v1 pipeline.ts precedent.
// Unlike the evidence/candidate-id checks above, an unrecognised tag is not a
// model error worth failing the run over; it just means retrieval widens.
// ---------------------------------------------------------------------------

export function filterKnownBottleneckTags(
  tags: readonly string[],
  allowed: ReadonlySet<string>,
): { kept: string[]; dropped: string[] } {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const tag of tags) (allowed.has(tag) ? kept : dropped).push(tag);
  return { kept, dropped };
}

// ---------------------------------------------------------------------------
// Synthesis / NextExperimentV2
// ---------------------------------------------------------------------------

export function checkSynthesisReferences(
  synthesis: SynthesisV2,
  known: ReadonlySet<string>,
): V2ValidationIssue[] {
  return checkEvidenceIdReferences(
    "supporting_evidence_ids",
    synthesis.supporting_evidence_ids,
    known,
  );
}

/** `review_after_days` must fall within the fixed execution window — prompt doc §2.6. */
export function validateNextExperimentTiming(
  experiment: SynthesisV2["next_experiment"],
): V2ValidationIssue[] {
  const issues: V2ValidationIssue[] = [];
  if (experiment.review_after_days > experiment.execution_window_days) {
    issues.push({
      path: "next_experiment.review_after_days",
      code: "review_after_exceeds_window",
      message: `review_after_days(${experiment.review_after_days})는 execution_window_days(${experiment.execution_window_days}) 이내여야 합니다.`,
    });
  }
  if (
    experiment.observation_window_days !== null &&
    experiment.observation_end_condition === null
  ) {
    issues.push({
      path: "next_experiment.observation_end_condition",
      code: "missing_observation_end_condition",
      message: "observation_window_days를 지정했다면 종료 조건도 함께 있어야 합니다.",
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Resource picks — same "drop out-of-range, never fail the run" precedent
// pipeline.ts already applies for v1 (see pipeline.ts's pick-resolution loop).
// ---------------------------------------------------------------------------

export function resolveResourcePicks<T>(
  picks: ResourceSelectionV2["picks"],
  candidates: readonly T[],
  getId: (candidate: T) => string,
  maxPicks: number,
): { resolved: { candidate: T; reason: string; action_step: string; conditions_to_confirm: string[] }[]; droppedCount: number } {
  const seen = new Set<string>();
  const resolved: {
    candidate: T;
    reason: string;
    action_step: string;
    conditions_to_confirm: string[];
  }[] = [];
  let droppedCount = 0;

  for (const pick of picks) {
    const candidate = candidates[pick.number - 1];
    const id = candidate ? getId(candidate) : undefined;
    if (!candidate || !id || seen.has(id)) {
      droppedCount += 1;
      continue;
    }
    seen.add(id);
    resolved.push({
      candidate,
      reason: pick.reason,
      action_step: pick.action_step,
      conditions_to_confirm: pick.conditions_to_confirm,
    });
    if (resolved.length === maxPicks) break;
  }

  return { resolved, droppedCount };
}

// ---------------------------------------------------------------------------
// Source ref verification
//
// The model can *claim* `locator_status: "verified"`, but nothing at this
// layer has actually re-opened the source and confirmed the excerpt appears
// at that locator — that requires reading the attachment's extracted text,
// which Stage 2 wires up. Until a real verifier is supplied, every claim is
// downgraded so the UI never shows an unverified claim as verified.
// ---------------------------------------------------------------------------

export type LocatorVerifier = (ref: SourceRefV2, source: SourceManifestEntry | undefined) => boolean;

export const NO_OP_VERIFIER: LocatorVerifier = () => false;

export function downgradeUnverifiableLocators(
  refs: readonly SourceRefV2[],
  manifestBySourceId: ReadonlyMap<string, SourceManifestEntry>,
  verify: LocatorVerifier = NO_OP_VERIFIER,
): SourceRefV2[] {
  return refs.map((ref) => {
    if (ref.locator_status !== "verified") return ref;
    const source = manifestBySourceId.get(ref.source_id);
    if (verify(ref, source)) return ref;
    return { ...ref, locator_status: "unverified" };
  });
}

export function checkSourceRefsExist(
  path: string,
  refs: readonly SourceRefV2[],
  knownSourceIds: ReadonlySet<string>,
): V2ValidationIssue[] {
  return refs
    .filter((ref) => !knownSourceIds.has(ref.source_id))
    .map((ref) => ({
      path,
      code: "unknown_source_id",
      message: `source_manifest에 없는 source_id를 참조했습니다: ${ref.source_id}`,
    }));
}
