import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPriorityHintV2 } from "./bottleneck-v2";
import { SHARED_RULES_V2 } from "@/lib/ai/context-v2";

const readiness = [
  {
    dimension: "customer_problem" as const,
    status: "unknown" as const,
    supporting_evidence_ids: [],
    contradicting_evidence_ids: [],
    missing_information: ["고객 인터뷰 없음"],
    scope: null,
  },
  {
    dimension: "commercial_validation" as const,
    status: "supported" as const,
    supporting_evidence_ids: ["ev_1"],
    contradicting_evidence_ids: [],
    missing_information: [],
    scope: null,
  },
];

// Regression guard for the exact thing Stage 2 was asked to remove: v1's
// "earliest stage gap is automatically the biggest bottleneck" rule.

test("SHARED_RULES_V2 does not contain v1's earliest-gap-auto-priority claim", () => {
  assert.doesNotMatch(SHARED_RULES_V2, /가장 이른 단계에서 벌어진 Gap이 가장 크다/);
});

test("SHARED_RULES_V2 explicitly disclaims the earliest-gap auto-priority rule", () => {
  assert.match(SHARED_RULES_V2, /가장 이른 단계에 빈칸이 있다고 자동으로 가장 큰 병목은 아니다/);
});

test("buildPriorityHintV2 lists gaps as material to weigh, not a ranked instruction", () => {
  const hint = buildPriorityHintV2({ current_stage: "solution", stage_status: "provisional", reasoning: "", limitations: [], readiness } as never, null);
  assert.match(hint, /고객 문제 실재성/); // the unknown dimension is surfaced
  assert.doesNotMatch(hint, /구매·도입 검증/); // the supported dimension is not listed as a gap
  assert.match(hint, /자동으로 최우선 후보가 되지 않는다/);
});

test("buildPriorityHintV2 surfaces actual execution constraints when present", () => {
  const hint = buildPriorityHintV2(
    { current_stage: "solution", stage_status: "provisional", reasoning: "", limitations: [], readiness: [] } as never,
    { hours_per_week: 10, budget_amount: 0, budget_currency: "KRW", customer_access: null, test_environment_access: null, hard_constraints: ["인허가 전 판매 불가"] },
  );
  assert.match(hint, /주당 투입 가능 시간: 10시간/);
  assert.match(hint, /인허가 전 판매 불가/);
});

test("buildPriorityHintV2 reports missing constraints as unknown rather than assuming none apply", () => {
  const hint = buildPriorityHintV2(
    { current_stage: "solution", stage_status: "provisional", reasoning: "", limitations: [], readiness: [] } as never,
    null,
  );
  assert.match(hint, /실행 여건이 입력되지 않음/);
});
