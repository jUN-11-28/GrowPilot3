import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertNoIssues,
  checkBottleneckReferences,
  checkRedTeamReferences,
  checkReadinessEvidenceReferences,
  checkEvidenceIdReferences,
  checkSynthesisReferences,
  filterKnownBottleneckTags,
  knownEvidenceIds,
  normalizeEvidenceIds,
  resolveResourcePicks,
  V2ValidationError,
  validateNextExperimentTiming,
  validateReadinessScope,
} from "./validate-v2";
import type { EvidenceAnalysisV2 } from "./schemas-v2";

const evidenceItem = (id: string) => ({
  evidence_id: id,
  claim: "claim",
  source_refs: [],
  provenance: "founder_report" as const,
  evidence_domain: "technical" as const,
  observation_kind: "other" as const,
  period: null,
  population: null,
  sample_size: null,
  numerator: null,
  denominator: null,
  conditions: null,
  supports: "s",
  does_not_establish: "d",
  limitations: "l",
});

const emptyEvidence: EvidenceAnalysisV2 = {
  available_evidence: [],
  unverified_hypotheses: [],
  missing_evidence: [],
  conflicts: [],
  summary: "",
  coverage_limitations: [],
};

// --- normalizeEvidenceIds ----------------------------------------------------

test("normalizeEvidenceIds re-keys the model's own ids to a canonical ev_N sequence", () => {
  const { evidence, idMap } = normalizeEvidenceIds({
    ...emptyEvidence,
    available_evidence: [evidenceItem("temp_a"), evidenceItem("temp_b")],
  });
  assert.deepEqual(
    evidence.available_evidence.map((e) => e.evidence_id),
    ["ev_1", "ev_2"],
  );
  assert.equal(idMap.get("temp_a"), "ev_1");
  assert.equal(idMap.get("temp_b"), "ev_2");
});

test("normalizeEvidenceIds collapses a duplicate id from the model to one canonical id", () => {
  const { evidence } = normalizeEvidenceIds({
    ...emptyEvidence,
    available_evidence: [evidenceItem("dup"), evidenceItem("dup")],
  });
  assert.deepEqual(
    evidence.available_evidence.map((e) => e.evidence_id),
    ["ev_1", "ev_1"],
  );
});

// --- reference integrity: acceptance scenario #8 (없는 evidence_id → 저장 차단) ---

test("checkEvidenceIdReferences flags an id that doesn't exist in the known set", () => {
  const known = knownEvidenceIds({ ...emptyEvidence, available_evidence: [evidenceItem("ev_1")] });
  const issues = checkEvidenceIdReferences("path", ["ev_1", "ev_999"], known);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, "unknown_evidence_id");
  assert.match(issues[0].message, /ev_999/);
});

test("checkEvidenceIdReferences passes clean when every id is known", () => {
  const known = knownEvidenceIds({ ...emptyEvidence, available_evidence: [evidenceItem("ev_1")] });
  assert.deepEqual(checkEvidenceIdReferences("path", ["ev_1"], known), []);
});

test("assertNoIssues throws V2ValidationError with the offending path/message when issues exist", () => {
  assert.throws(
    () => assertNoIssues([{ path: "x.y", code: "c", message: "boom" }]),
    (err: unknown) => {
      assert.ok(err instanceof V2ValidationError);
      assert.match((err as Error).message, /x\.y/);
      assert.match((err as Error).message, /boom/);
      return true;
    },
  );
});

test("assertNoIssues is a no-op for an empty issue list", () => {
  assert.doesNotThrow(() => assertNoIssues([]));
});

test("checkReadinessEvidenceReferences checks both supporting and contradicting ids", () => {
  const known = knownEvidenceIds({ ...emptyEvidence, available_evidence: [evidenceItem("ev_1")] });
  const issues = checkReadinessEvidenceReferences(
    [
      {
        dimension: "technical_feasibility",
        status: "supported",
        supporting_evidence_ids: ["ev_1"],
        contradicting_evidence_ids: ["ev_missing"],
        missing_information: [],
        scope: null,
      },
    ],
    known,
  );
  assert.equal(issues.length, 1);
  assert.match(issues[0].path, /contradicting_evidence_ids/);
});

test("validateReadinessScope requires a scope only when status is not_applicable", () => {
  const okBecauseSupported = validateReadinessScope([
    { dimension: "repeat_use", status: "supported", supporting_evidence_ids: [], contradicting_evidence_ids: [], missing_information: [], scope: null },
  ]);
  assert.deepEqual(okBecauseSupported, []);

  const failsBecauseMissingScope = validateReadinessScope([
    { dimension: "repeat_use", status: "not_applicable", supporting_evidence_ids: [], contradicting_evidence_ids: [], missing_information: [], scope: null },
  ]);
  assert.equal(failsBecauseMissingScope.length, 1);
  assert.equal(failsBecauseMissingScope[0].code, "missing_not_applicable_scope");

  const okWithScope = validateReadinessScope([
    { dimension: "repeat_use", status: "not_applicable", supporting_evidence_ids: [], contradicting_evidence_ids: [], missing_information: [], scope: "아직 사용자가 없다" },
  ]);
  assert.deepEqual(okWithScope, []);
});

// --- candidate / red-team reference checks ----------------------------------

const candidate = (id: string) => ({
  candidate_id: id,
  statement: "s",
  diagnosis_status: "observed_issue" as const,
  supporting_evidence_ids: [],
  opposing_evidence_ids: [],
  missing_information: [],
  impact: "",
  urgency: "",
  dependency: "",
  feasibility: "",
  priority_reason: "",
});

test("checkBottleneckReferences flags a selected_candidate_id absent from candidates", () => {
  const known = knownEvidenceIds(emptyEvidence);
  const issues = checkBottleneckReferences(
    {
      candidates: [candidate("cand_1")],
      selected_candidate_id: "cand_ghost",
      selection_reason: "r",
      deferred_candidates: [],
      lean_analyst_opinion: "o",
    },
    known,
  );
  assert.ok(issues.some((i) => i.code === "unknown_candidate_id" && /cand_ghost/.test(i.message)));
});

test("checkBottleneckReferences accepts a selected_candidate_id that matches a real candidate, or null", () => {
  const known = knownEvidenceIds(emptyEvidence);
  const validSelection = checkBottleneckReferences(
    { candidates: [candidate("cand_1")], selected_candidate_id: "cand_1", selection_reason: "r", deferred_candidates: [], lean_analyst_opinion: "o" },
    known,
  );
  assert.deepEqual(validSelection, []);

  const nullSelection = checkBottleneckReferences(
    { candidates: [candidate("cand_1")], selected_candidate_id: null, selection_reason: "r", deferred_candidates: [], lean_analyst_opinion: "o" },
    known,
  );
  assert.deepEqual(nullSelection, []);
});

test("checkRedTeamReferences flags a challenge targeting a candidate id that doesn't exist", () => {
  const issues = checkRedTeamReferences(
    {
      verdict: "revise",
      challenges: [{ target_candidate_id: "cand_ghost", claim: "c", evidence_ids: [], reason: "r", suggested_resolution: "s" }],
      alternative_candidate: null,
      counterargument: "c",
      revision_note: "n",
    },
    new Set(["cand_1"]),
  );
  assert.equal(issues.length, 1);
});

// --- bottleneck tag filtering (drop-and-widen, never fail the run) ---------

test("filterKnownBottleneckTags keeps allowed tags and drops the rest without throwing", () => {
  const { kept, dropped } = filterKnownBottleneckTags(
    ["technical_feasibility", "made_up_tag"],
    new Set(["technical_feasibility", "customer_definition"]),
  );
  assert.deepEqual(kept, ["technical_feasibility"]);
  assert.deepEqual(dropped, ["made_up_tag"]);
});

// --- next_experiment timing (14일 실행 vs 관찰 기간 구분, scenario #6) --------

test("validateNextExperimentTiming flags review_after_days exceeding the execution window", () => {
  const issues = validateNextExperimentTiming({
    execution_window_days: 7,
    review_after_days: 10,
    observation_window_days: null,
    observation_end_condition: null,
  } as never);
  assert.ok(issues.some((i) => i.code === "review_after_exceeds_window"));
});

test("validateNextExperimentTiming passes when review_after_days is within the window", () => {
  const issues = validateNextExperimentTiming({
    execution_window_days: 14,
    review_after_days: 14,
    observation_window_days: 90,
    observation_end_condition: "코호트가 90일을 채웠을 때",
  } as never);
  assert.deepEqual(issues, []);
});

test("validateNextExperimentTiming requires an end condition whenever an observation window is set", () => {
  const issues = validateNextExperimentTiming({
    execution_window_days: 14,
    review_after_days: 14,
    observation_window_days: 90,
    observation_end_condition: null,
  } as never);
  assert.ok(issues.some((i) => i.code === "missing_observation_end_condition"));
});

// --- synthesis-level evidence reference check -------------------------------

test("checkSynthesisReferences flags a dangling supporting_evidence_ids entry", () => {
  const known = knownEvidenceIds({ ...emptyEvidence, available_evidence: [evidenceItem("ev_1")] });
  const issues = checkSynthesisReferences(
    { supporting_evidence_ids: ["ev_1", "ev_ghost"] } as never,
    known,
  );
  assert.equal(issues.length, 1);
});

// --- resource picks: out-of-range / duplicate handling (scenario #10) ------

test("resolveResourcePicks drops an out-of-range pick instead of producing a dangling reference", () => {
  const candidates = [{ id: "r1" }, { id: "r2" }];
  const { resolved, droppedCount } = resolveResourcePicks(
    [{ number: 1, reason: "a", action_step: "x", conditions_to_confirm: [] }, { number: 99, reason: "b", action_step: "y", conditions_to_confirm: [] }],
    candidates,
    (c) => c.id,
    5,
  );
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].candidate.id, "r1");
  assert.equal(droppedCount, 1);
});

test("resolveResourcePicks drops a duplicate pick of the same candidate", () => {
  const candidates = [{ id: "r1" }];
  const { resolved, droppedCount } = resolveResourcePicks(
    [{ number: 1, reason: "a", action_step: "x", conditions_to_confirm: [] }, { number: 1, reason: "b", action_step: "y", conditions_to_confirm: [] }],
    candidates,
    (c) => c.id,
    5,
  );
  assert.equal(resolved.length, 1);
  assert.equal(droppedCount, 1);
});

test("resolveResourcePicks caps at maxPicks even when more valid picks are offered", () => {
  const candidates = [{ id: "r1" }, { id: "r2" }, { id: "r3" }];
  const { resolved } = resolveResourcePicks(
    candidates.map((_, i) => ({ number: i + 1, reason: "r", action_step: "a", conditions_to_confirm: [] })),
    candidates,
    (c) => c.id,
    2,
  );
  assert.equal(resolved.length, 2);
});
