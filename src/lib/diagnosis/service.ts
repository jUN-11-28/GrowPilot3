import "server-only";

import { getAIProvider, type InlineFile } from "@/lib/ai/provider";
import { QuestionBatchSchema } from "@/lib/ai/schemas";
import {
  buildQuestionPrompt,
  questionSystem,
} from "@/lib/ai/prompts/question";
import { buildQuestionPromptV2, questionSystemV2 } from "@/lib/ai/prompts/question-v2";
import type { AttachmentSummary, DiagnosisContext } from "@/lib/ai/context";
import type { DiagnosisContextV2 } from "@/lib/ai/context-v2";
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_RESOURCE_CANDIDATES_RETURNED,
  MIN_RESOURCE_CANDIDATES,
} from "@/lib/domain/constants";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  DiagnosisAnswerRow,
  DiagnosisSessionRow,
  GrowthStage,
  ProjectAttachmentRow,
  ProjectRow,
  ResourceRow,
} from "@/lib/types/database";

type Client = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Question-generation and analysis-run locking (Stage 4).
//
// Both follow the same shape: a "run id" claims the right to do the one
// expensive thing (a model call), a lease with an expiry so a crashed or
// timed-out claimant doesn't hold the lock forever, and every write that
// finalizes the outcome is scoped to `.eq(<run_id column>, runId)` so a claim
// that outlived its lease (and got reclaimed by someone else) can never
// overwrite what the new claimant produced.
// ---------------------------------------------------------------------------

/** A single non-thinking `question` call is fast; this is generous, not tuned. */
export const QUESTION_GENERATION_LOCK_MS = 90_000;

/**
 * Claims the right to generate this session's question batch. Returns the
 * run id on success, or `null` if another request already holds a live claim
 * (the caller should report "generating" and let the client retry shortly,
 * never call the model itself).
 */
export async function claimQuestionGeneration(
  supabase: Client,
  sessionId: string,
  userId: string,
): Promise<string | null> {
  const runId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  // `pending` (never generated) or `failed` (previous attempt errored) can be
  // claimed immediately — neither represents a live in-flight call.
  const { data: claim } = await supabase
    .from("diagnosis_sessions")
    .update({ question_status: "generating", question_run_id: runId, question_started_at: nowIso })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .in("question_status", ["pending", "failed"])
    .select("id")
    .maybeSingle();
  if (claim) return runId;

  // A `generating` claim past its lease is treated as abandoned (crash,
  // platform timeout) and can be reclaimed without waiting further.
  const staleIso = new Date(Date.now() - QUESTION_GENERATION_LOCK_MS).toISOString();
  const { data: staleClaim } = await supabase
    .from("diagnosis_sessions")
    .update({ question_status: "generating", question_run_id: runId, question_started_at: nowIso })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("question_status", "generating")
    .lt("question_started_at", staleIso)
    .select("id")
    .maybeSingle();
  return staleClaim ? runId : null;
}

/** Only the run that currently holds the claim (`question_run_id = runId`) can finalize it. */
export async function finalizeQuestionGeneration(
  supabase: Client,
  sessionId: string,
  runId: string,
  status: "completed" | "failed",
): Promise<void> {
  await supabase
    .from("diagnosis_sessions")
    .update({ question_status: status })
    .eq("id", sessionId)
    .eq("question_run_id", runId);
}

/**
 * Individual model calls time out at 120s (see provider.ts); the route's own
 * `maxDuration` is 300s. Six sequential calls (v1) or up to six-plus-repair
 * (v2) can in principle exceed both — this lease is set just under the route
 * budget so a request the platform actually killed becomes reclaimable
 * almost immediately, not "eventually." It does not make a six-call chain
 * finish inside 300s; nothing can guarantee that without changing how many
 * calls a run makes, which is out of scope here (see completion report).
 */
export const ANALYSIS_LOCK_DURATION_MS = 290_000;

/**
 * Claims the right to run the diagnosis pipeline for this session. Returns
 * the run id on success, or `null` if a live (unexpired) claim already
 * exists — the caller must not call the model in that case.
 */
export async function claimAnalysisRun(
  supabase: Client,
  sessionId: string,
  userId: string,
): Promise<string | null> {
  const runId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const lockExpiresIso = new Date(Date.now() + ANALYSIS_LOCK_DURATION_MS).toISOString();

  const { data } = await supabase
    .from("diagnosis_sessions")
    .update({
      status: "analyzing",
      analysis_run_id: runId,
      analysis_lock_expires_at: lockExpiresIso,
      error_message: null,
    })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .neq("status", "completed")
    .or(`analysis_lock_expires_at.is.null,analysis_lock_expires_at.lt.${nowIso}`)
    .select("id")
    .maybeSingle();

  return data ? runId : null;
}

/** Only the run that currently holds the claim (`analysis_run_id = runId`) can finalize it. */
export async function finalizeAnalysisRun(
  supabase: Client,
  sessionId: string,
  userId: string,
  runId: string,
  patch: { status: "completed"; completedAt: string } | { status: "failed"; errorMessage: string },
): Promise<void> {
  await supabase
    .from("diagnosis_sessions")
    .update(
      patch.status === "completed"
        ? { status: "completed", completed_at: patch.completedAt }
        : { status: "failed", error_message: patch.errorMessage },
    )
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("analysis_run_id", runId);
}

export function buildContext(
  project: ProjectRow,
  answers: DiagnosisAnswerRow[],
  attachments: ProjectAttachmentRow[] = [],
): DiagnosisContext {
  const attachmentSummaries: AttachmentSummary[] = attachments.map((row) => ({
    kind: row.kind,
    fileName: row.file_name,
    note: row.note,
  }));

  return {
    project: {
      name: project.name,
      problem: project.problem,
      target_customer: project.target_customer,
      solution: project.solution,
      stage: project.stage,
      evidence: project.evidence,
    },
    answers: answers
      .filter((row): row is DiagnosisAnswerRow & { answer: string } =>
        Boolean(row.answer),
      )
      .map((row) => ({ question: row.question, answer: row.answer })),
    attachments: attachmentSummaries,
  };
}

export function pendingQuestion(
  answers: DiagnosisAnswerRow[],
): DiagnosisAnswerRow | null {
  return answers.find((row) => row.answer === null) ?? null;
}

/**
 * v2 — one row's outcome from {@link loadAttachmentFiles}, so a caller (the
 * v2 source manifest, in particular) can tell "no evidence was collected"
 * apart from "evidence exists but this file couldn't be read" apart from
 * "the file was skipped only because the request was already full."
 */
export type AttachmentLoadStatus =
  | "loaded"
  | "note_only"
  | "omitted_size"
  | "unsupported"
  | "failed";

export interface AttachmentLoadResult {
  attachmentId: string;
  sourceId: string;
  fileName: string | null;
  status: AttachmentLoadStatus;
  errorCode: string | null;
  file: InlineFile | null;
}

export interface AttachmentLoadOutcome {
  /** v1 shape, preserved: every successfully loaded file, in row order. */
  files: InlineFile[];
  /** v2 — one entry per input row, whatever the outcome. */
  results: AttachmentLoadResult[];
}

/**
 * Downloads attachments the model can read inline (images, PDF, plain text)
 * and base64-encodes them, capped so a single request never explodes.
 *
 * Byte budget is checked twice: once against the stored `byte_size` before
 * downloading (cheap, but that metadata can be stale or absent), and again
 * against the actual downloaded buffer — a file that turns out larger than
 * declared must not silently blow past MAX_ATTACHMENT_BYTES just because the
 * pre-check passed on bad metadata.
 */
export async function loadAttachmentFiles(
  supabase: Client,
  attachments: ProjectAttachmentRow[],
): Promise<AttachmentLoadOutcome> {
  const allowed = new Set<string>(ALLOWED_ATTACHMENT_MIME_TYPES);
  const files: InlineFile[] = [];
  const results: AttachmentLoadResult[] = [];
  let totalBytes = 0;

  for (const attachment of attachments) {
    const sourceId = `attachment:${attachment.id}`;
    const base = { attachmentId: attachment.id, sourceId, fileName: attachment.file_name };

    if (!attachment.storage_path || !attachment.mime_type) {
      // A note-only row (e.g. a "concern" with no file) — expected, not a failure.
      results.push({ ...base, status: "note_only", errorCode: null, file: null });
      continue;
    }
    if (!allowed.has(attachment.mime_type)) {
      results.push({ ...base, status: "unsupported", errorCode: "unsupported_mime", file: null });
      continue;
    }
    if (totalBytes + (attachment.byte_size ?? 0) > MAX_ATTACHMENT_BYTES) {
      results.push({ ...base, status: "omitted_size", errorCode: "size_pre_check", file: null });
      continue;
    }

    const { data, error } = await supabase.storage
      .from("attachments")
      .download(attachment.storage_path);
    if (error || !data) {
      results.push({ ...base, status: "failed", errorCode: "download_error", file: null });
      continue;
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    if (totalBytes + buffer.byteLength > MAX_ATTACHMENT_BYTES) {
      results.push({ ...base, status: "omitted_size", errorCode: "size_post_check", file: null });
      continue;
    }

    totalBytes += buffer.byteLength;
    const file: InlineFile = { mimeType: attachment.mime_type, base64: buffer.toString("base64") };
    files.push(file);
    results.push({ ...base, status: "loaded", errorCode: null, file });
  }

  return { files, results };
}

/**
 * Plans the whole interview (up to MAX_QUESTIONS) in a single call and persists
 * every question at once, so a reloaded session resumes without ever waiting on
 * the model again — only the first render of the session pays for generation.
 * Returns the rows so the caller doesn't need a second read.
 */
async function persistQuestionBatch(
  supabase: Client,
  session: DiagnosisSessionRow,
  batch: { questions: { reason: string; question: string; question_type: string; options: string[] }[] },
): Promise<DiagnosisAnswerRow[]> {
  // Always ask at least one question — otherwise the "diagnosis" is just the
  // intake form read back.
  const planned = batch.questions
    .filter((q) => q.question.trim().length > 0)
    .slice(0, session.max_questions);
  if (planned.length === 0) return [];

  const { data, error } = await supabase
    .from("diagnosis_answers")
    .insert(
      planned.map((next, index) => {
        const isChoice = next.question_type === "single_choice" && next.options.length >= 2;
        return {
          session_id: session.id,
          user_id: session.user_id,
          order_index: index + 1,
          question: next.question.trim(),
          question_reason: next.reason,
          question_type: isChoice ? ("single_choice" as const) : ("text" as const),
          options: isChoice ? next.options.slice(0, 5) : [],
        };
      }),
    )
    .select("*")
    .order("order_index", { ascending: true });

  if (error || !data) {
    throw new Error(`질문을 저장하지 못했습니다: ${error?.message ?? "unknown"}`);
  }
  return data;
}

export async function generateQuestionBatch(
  supabase: Client,
  session: DiagnosisSessionRow,
  project: ProjectRow,
  attachments: ProjectAttachmentRow[],
  files: InlineFile[],
): Promise<DiagnosisAnswerRow[]> {
  const batch = await getAIProvider().generateStructured({
    kind: "question",
    system: questionSystem,
    prompt: buildQuestionPrompt(buildContext(project, [], attachments)),
    schema: QuestionBatchSchema,
    maxTokens: 8000,
    effort: "none",
    files,
  });

  return persistQuestionBatch(supabase, session, batch);
}

/**
 * v2 — same persistence, built-out context (technical_context/execution_
 * constraints/source_manifest). The QuestionBatch *schema* is unchanged
 * between v1 and v2 (see schemas-v2.ts), so `kind` stays `"question"`.
 */
export async function generateQuestionBatchV2(
  supabase: Client,
  session: DiagnosisSessionRow,
  context: DiagnosisContextV2,
  files: InlineFile[],
): Promise<DiagnosisAnswerRow[]> {
  const batch = await getAIProvider().generateStructured({
    kind: "question",
    system: questionSystemV2,
    prompt: buildQuestionPromptV2(context),
    schema: QuestionBatchSchema,
    maxTokens: 8000,
    effort: "none",
    files,
  });

  return persistQuestionBatch(supabase, session, batch);
}

export interface ResourceSearchResultV2 {
  candidates: ResourceRow[];
  lookupStatus: "ok" | "failed";
  retrievalMode: "tag" | "expanded" | "none";
  /** Human-readable notes on widening/truncation/failure, kept for the trace — never shown to the model as if it were a resource. */
  excludedReasons: string[];
}

/**
 * Retrieval for the Resource Agent.
 *
 * The catalogue is searched by the *confirmed bottleneck's* tags — not by the
 * founder's profile, and not by handing the model the whole catalogue. The
 * stage pass only widens a search that came back too thin to choose from, and
 * tag matches always stay ahead of stage matches so the ranking the model sees
 * already reflects the bottleneck.
 *
 * A genuine Supabase error is reported as `lookupStatus: "failed"` — it is
 * never silently treated as "found nothing" (that used to read, incorrectly,
 * as "no external help needed"). Once a query errors, no further fallback
 * query is attempted; a database that's failing once is likely to fail again,
 * and mixing partial results with an error is worse than reporting the error.
 */
export async function searchResourcesByBottleneckV2(
  supabase: Client,
  { tags, stage }: { tags: readonly string[]; stage: GrowthStage | null },
): Promise<ResourceSearchResultV2> {
  const found = new Map<string, ResourceRow>();
  const excludedReasons: string[] = [];
  const add = (rows: ResourceRow[] | null) => {
    for (const row of rows ?? []) if (!found.has(row.id)) found.set(row.id, row);
  };

  let tagOnlyCount = 0;
  if (tags.length > 0) {
    const { data, error } = await supabase
      .from("resources")
      .select("*")
      .overlaps("bottleneck_tags", tags)
      .order("created_at", { ascending: true });
    if (error) {
      return { candidates: [], lookupStatus: "failed", retrievalMode: "none", excludedReasons: [error.message] };
    }
    add(data);
    tagOnlyCount = found.size;
  }

  let widened = false;

  // A null stage (v2 — no evidence supports ranking one) has nothing to widen
  // against; the tag search result (possibly empty) stands as-is here, and
  // the "never leave the agent with nothing" fallback below still applies.
  if (stage !== null && found.size < MIN_RESOURCE_CANDIDATES) {
    const { data, error } = await supabase
      .from("resources")
      .select("*")
      .contains("stage_tags", [stage])
      .order("created_at", { ascending: true });
    if (error) {
      return {
        candidates: [...found.values()],
        lookupStatus: "failed",
        retrievalMode: tagOnlyCount > 0 ? "tag" : "none",
        excludedReasons: [error.message],
      };
    }
    if (found.size < MIN_RESOURCE_CANDIDATES && data && data.length > 0) widened = true;
    add(data);
  }

  // Never leave the agent with nothing to choose from — but this is a
  // last-resort fallback, not a normal match, and must never be reported the
  // same way a real tag/stage match is.
  if (found.size === 0) {
    const { data, error } = await supabase
      .from("resources")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) {
      return { candidates: [], lookupStatus: "failed", retrievalMode: "none", excludedReasons: [error.message] };
    }
    if (data && data.length > 0) widened = true;
    add(data);
  }

  let candidates = [...found.values()];
  if (candidates.length > MAX_RESOURCE_CANDIDATES_RETURNED) {
    excludedReasons.push(
      `후보 ${candidates.length}건 중 상위 ${MAX_RESOURCE_CANDIDATES_RETURNED}건만 전달했습니다.`,
    );
    candidates = candidates.slice(0, MAX_RESOURCE_CANDIDATES_RETURNED);
  }

  const retrievalMode: ResourceSearchResultV2["retrievalMode"] =
    tagOnlyCount > 0 && !widened ? "tag" : tags.length > 0 || stage !== null ? "expanded" : "none";

  return { candidates, lookupStatus: "ok", retrievalMode, excludedReasons };
}

/** v1-compatible shape — same retrieval, without the status metadata v1's pipeline never asked for. */
export async function searchResourcesByBottleneck(
  supabase: Client,
  query: { tags: readonly string[]; stage: GrowthStage | null },
): Promise<ResourceRow[]> {
  const result = await searchResourcesByBottleneckV2(supabase, query);
  if (result.lookupStatus === "failed") {
    throw new Error(`자원 조회에 실패했습니다: ${result.excludedReasons.join("; ")}`);
  }
  return result.candidates;
}
