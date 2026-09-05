import { test } from "node:test";
import assert from "node:assert/strict";
import { coerceUnknownCounts, sanitizeEvidenceRecordDraftV2 } from "./validate-evidence-record-v2";
import type { EvidenceRecordDraftV2 } from "./schemas-v2";

function draft(overrides: Partial<EvidenceRecordDraftV2> = {}): EvidenceRecordDraftV2 {
  return {
    what: null,
    when_text: null,
    who_description: null,
    interview_count: { value: null, known: false },
    unique_participant_count: { value: null, known: false },
    purpose: null,
    method: [],
    key_results: [],
    metrics: [],
    quotes: [],
    conflicting_points: [],
    unknowns: [],
    duplicate_suspected: { suspected: false, reason: null },
    purchase_signal: null,
    summary: "s",
    ...overrides,
  };
}

// --- scenario #8: date/headcount absent -> "모름", never a guessed number ---

test("coerceUnknownCounts nulls out a stray value the model attached to known:false — a count marked unknown never carries a leftover number", () => {
  const input = draft({
    interview_count: { value: 5, known: false },
    unique_participant_count: { value: 3, known: true },
  });
  const result = coerceUnknownCounts(input);
  assert.deepEqual(result.interview_count, { value: null, known: false });
  // known:true with a real value is left untouched — this is not "always null", only the unknown case.
  assert.deepEqual(result.unique_participant_count, { value: 3, known: true });
});

test("coerceUnknownCounts leaves known:true, value:null alone (a confirmed count the model simply couldn't compute a number for)", () => {
  const input = draft({ interview_count: { value: null, known: true } });
  const result = coerceUnknownCounts(input);
  assert.deepEqual(result.interview_count, { value: null, known: true });
});

// --- rule 6: never fabricate a source location that wasn't actually offered ---

test("sanitizeEvidenceRecordDraftV2 drops a source_ref pointing at a source_id that was never offered for this record", () => {
  const input = draft({
    quotes: [
      {
        text: "인용",
        speaker_role: null,
        source_refs: [
          { source_id: "attachment:real", locator: null, excerpt: null, locator_status: "unverified" },
          { source_id: "attachment:made-up", locator: "p.3", excerpt: "x", locator_status: "verified" },
        ],
      },
    ],
  });
  const allowed = new Set(["evidence_record_body:rec1", "attachment:real"]);
  const { draft: sanitized, droppedRefCount } = sanitizeEvidenceRecordDraftV2(input, allowed);
  assert.equal(droppedRefCount, 1);
  assert.equal(sanitized.quotes[0].source_refs.length, 1);
  assert.equal(sanitized.quotes[0].source_refs[0].source_id, "attachment:real");
});

test("sanitizeEvidenceRecordDraftV2 sanitizes metrics and conflicting_points refs too, and counts drops across all three", () => {
  const input = draft({
    metrics: [
      {
        label: "l",
        value: "v",
        unit: null,
        source_refs: [{ source_id: "bogus", locator: null, excerpt: null, locator_status: "unavailable" }],
      },
    ],
    conflicting_points: [
      {
        description: "d",
        source_refs: [{ source_id: "bogus2", locator: null, excerpt: null, locator_status: "unavailable" }],
      },
    ],
  });
  const { draft: sanitized, droppedRefCount } = sanitizeEvidenceRecordDraftV2(input, new Set());
  assert.equal(droppedRefCount, 2);
  assert.equal(sanitized.metrics[0].source_refs.length, 0);
  assert.equal(sanitized.conflicting_points[0].source_refs.length, 0);
});

test("sanitizeEvidenceRecordDraftV2 keeps a fully-valid draft unchanged (0 dropped)", () => {
  const input = draft({
    quotes: [
      {
        text: "인용",
        speaker_role: null,
        source_refs: [{ source_id: "evidence_record_body:rec1", locator: null, excerpt: null, locator_status: "unverified" }],
      },
    ],
  });
  const { droppedRefCount } = sanitizeEvidenceRecordDraftV2(input, new Set(["evidence_record_body:rec1"]));
  assert.equal(droppedRefCount, 0);
});

// --- scenario #7: duplicate possibility is preserved, never auto-merged ---

test("a draft can flag duplicate_suspected without the sanitizer touching or clearing it", () => {
  const input = draft({ duplicate_suspected: { suspected: true, reason: "같은 인터뷰의 요약본으로 보임" } });
  const { draft: sanitized } = sanitizeEvidenceRecordDraftV2(input, new Set());
  assert.equal(sanitized.duplicate_suspected.suspected, true);
  assert.equal(sanitized.duplicate_suspected.reason, "같은 인터뷰의 요약본으로 보임");
});
