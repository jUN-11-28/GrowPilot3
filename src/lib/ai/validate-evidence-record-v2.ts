import "server-only";

import type { EvidenceRecordDraftV2, SourceRefV2 } from "@/lib/ai/schemas-v2";

/**
 * Semantic cleanup for one evidence record's "AI로 정리" output — mirrors
 * validate-v2.ts's approach (schemas stay free of cross-field/reference
 * checks; this module runs after `schema.parse()`), but drop-and-flag rather
 * than fatal: a stray source_id in one quote is not worth failing the whole
 * per-record analysis over, unlike a dangling evidence_id in the main
 * diagnosis pipeline where every reference must resolve.
 *
 * "확인하지 못한 페이지 번호나 출처 위치를 만들어내지 마라" (rule doc §6) is
 * enforced here by dropping any source_ref whose source_id was not actually
 * offered to the model for this record (the record's own body source_id and
 * its currently-linked attachment source_ids) — a made-up or copied-over id
 * from another record can never survive into what the user sees.
 */
export interface SanitizeResult {
  draft: EvidenceRecordDraftV2;
  droppedRefCount: number;
}

function sanitizeRefs(
  refs: readonly SourceRefV2[],
  allowed: ReadonlySet<string>,
): { kept: SourceRefV2[]; dropped: number } {
  const kept = refs.filter((ref) => allowed.has(ref.source_id));
  return { kept, dropped: refs.length - kept.length };
}

export function sanitizeEvidenceRecordDraftV2(
  draft: EvidenceRecordDraftV2,
  allowedSourceIds: ReadonlySet<string>,
): SanitizeResult {
  let dropped = 0;

  const metrics = draft.metrics.map((m) => {
    const r = sanitizeRefs(m.source_refs, allowedSourceIds);
    dropped += r.dropped;
    return { ...m, source_refs: r.kept };
  });
  const quotes = draft.quotes.map((q) => {
    const r = sanitizeRefs(q.source_refs, allowedSourceIds);
    dropped += r.dropped;
    return { ...q, source_refs: r.kept };
  });
  const conflicting_points = draft.conflicting_points.map((c) => {
    const r = sanitizeRefs(c.source_refs, allowedSourceIds);
    dropped += r.dropped;
    return { ...c, source_refs: r.kept };
  });

  return {
    draft: { ...draft, metrics, quotes, conflicting_points },
    droppedRefCount: dropped,
  };
}

/**
 * Rule 6: a count the model marks `known: false` must not carry a leftover
 * number — otherwise the UI could show a stale/fabricated-looking value next
 * to "모름". Coerces `value` to null whenever `known` is false; never invents
 * a value when `known` is true but `value` is null (that stays null — "모름"
 * with no number, which the schema already allows).
 */
export function coerceUnknownCounts(draft: EvidenceRecordDraftV2): EvidenceRecordDraftV2 {
  return {
    ...draft,
    interview_count: draft.interview_count.known
      ? draft.interview_count
      : { value: null, known: false },
    unique_participant_count: draft.unique_participant_count.known
      ? draft.unique_participant_count
      : { value: null, known: false },
  };
}
