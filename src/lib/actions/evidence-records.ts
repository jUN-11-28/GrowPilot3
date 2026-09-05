"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProject } from "@/lib/data/projects";
import { getEvidenceRecord } from "@/lib/data/evidence-records";
import { sanitizeFileName } from "@/lib/utils";
import { loadAttachmentFiles } from "@/lib/diagnosis/service";
import { getAIProvider } from "@/lib/ai/provider";
import { geminiModel } from "@/lib/env";
import {
  EvidenceRecordDraftV2Schema,
  UserEvidenceContextSchema,
  purchaseSignalV2,
  type EvidenceRecordDraftV2,
} from "@/lib/ai/schemas-v2";
import {
  buildEvidenceRecordPromptV2,
  evidenceRecordSystemV2,
  EVIDENCE_RECORD_PROMPT_VERSION_V2,
} from "@/lib/ai/prompts/evidence-record-v2";
import {
  coerceUnknownCounts,
  sanitizeEvidenceRecordDraftV2,
} from "@/lib/ai/validate-evidence-record-v2";
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  EVIDENCE_ATTACHMENT_KIND,
  EVIDENCE_LABEL,
  EVIDENCE_RECORD_TYPE_VALUES,
  MAX_ATTACHMENT_BYTES,
  MAX_EVIDENCE_RECORD_BODY_LENGTH,
  MAX_EVIDENCE_RECORD_FILES,
  MAX_EVIDENCE_RECORD_TITLE_LENGTH,
} from "@/lib/domain/constants";
import type { EvidenceRecordRow, EvidenceRecordType, ProjectAttachmentRow } from "@/lib/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

type Client = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

export interface FileUploadResult {
  fileName: string;
  status: "uploaded" | "failed";
  attachmentId?: string;
  errorMessage?: string;
}

export interface EvidenceRecordFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  evidenceRecordId?: string;
  title?: string;
  fileResults?: FileUploadResult[];
}

export interface EvidenceRecordSimpleState {
  error?: string;
  saved?: boolean;
}

const userContextFieldsSchema = z.object({
  occurredAt: z.string().trim().max(200).optional(),
  targetDescription: z.string().trim().max(500).optional(),
  interviewCount: z.string().trim().optional(),
  uniqueParticipantCount: z.string().trim().optional(),
});

function optionalPositiveInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function parseUserContext(formData: FormData) {
  const raw = userContextFieldsSchema.parse({
    occurredAt: formData.get("occurredAt") || undefined,
    targetDescription: formData.get("targetDescription") || undefined,
    interviewCount: formData.get("interviewCount") || undefined,
    uniqueParticipantCount: formData.get("uniqueParticipantCount") || undefined,
  });
  return UserEvidenceContextSchema.parse({
    occurred_at: raw.occurredAt ?? null,
    target_description: raw.targetDescription ?? null,
    interview_count: optionalPositiveInt(raw.interviewCount),
    unique_participant_count: optionalPositiveInt(raw.uniqueParticipantCount),
  });
}

/** A default title from the evidence type / first file name when the founder leaves the title blank — never stored blank. */
function defaultTitle(evidenceType: EvidenceRecordType, firstFileName: string | null): string {
  if (firstFileName) {
    const withoutExt = firstFileName.replace(/\.[^.]+$/, "");
    if (withoutExt.trim().length > 0) return withoutExt.slice(0, MAX_EVIDENCE_RECORD_TITLE_LENGTH);
  }
  return `${EVIDENCE_LABEL[evidenceType]} 자료`;
}

// ---------------------------------------------------------------------------
// File upload — reuses the existing `attachments` storage bucket and
// project_attachments table (kind: 'evidence'), never a parallel system.
// Server re-validates real size/type/ownership regardless of what the client
// already checked.
// ---------------------------------------------------------------------------

async function uploadOneEvidenceFile(
  supabase: Client,
  userId: string,
  projectId: string,
  evidenceRecordId: string,
  file: File,
): Promise<FileUploadResult> {
  const base = { fileName: file.name };
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ...base, status: "failed", errorMessage: "파일이 너무 큽니다. 15MB 이하로 올려 주세요." };
  }
  if (!(ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
    return {
      ...base,
      status: "failed",
      errorMessage: "지원하지 않는 파일 형식입니다. PDF, 이미지, 텍스트 파일만 가능합니다.",
    };
  }

  const path = `${userId}/${projectId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from("attachments")
    .upload(path, file, { contentType: file.type });
  if (uploadError) {
    return { ...base, status: "failed", errorMessage: "업로드하지 못했습니다. 다시 시도해 주세요." };
  }

  const { data: attachment, error: insertError } = await supabase
    .from("project_attachments")
    .insert({
      project_id: projectId,
      user_id: userId,
      kind: EVIDENCE_ATTACHMENT_KIND,
      note: null,
      file_name: file.name,
      mime_type: file.type,
      storage_path: path,
      byte_size: file.size,
    })
    .select("id")
    .single();

  if (insertError || !attachment) {
    await supabase.storage.from("attachments").remove([path]);
    return { ...base, status: "failed", errorMessage: "저장하지 못했습니다. 다시 시도해 주세요." };
  }

  const { error: linkError } = await supabase.from("evidence_record_attachments").insert({
    evidence_record_id: evidenceRecordId,
    attachment_id: attachment.id,
    user_id: userId,
  });
  if (linkError) {
    // The file itself is safely stored (and still visible from the plain
    // attachments panel) — only the link to this record failed, so the file
    // is not deleted. The founder can link it manually afterward.
    return { ...base, status: "failed", errorMessage: "파일은 저장했지만 이 자료에 연결하지 못했습니다.", attachmentId: attachment.id };
  }

  return { ...base, status: "uploaded", attachmentId: attachment.id };
}

function extractFiles(formData: FormData): File[] {
  return formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, MAX_EVIDENCE_RECORD_FILES);
}

async function bumpSourceVersion(supabase: Client, recordId: string, userId: string): Promise<void> {
  const { data } = await supabase
    .from("evidence_records")
    .select("source_version")
    .eq("id", recordId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return;
  await supabase
    .from("evidence_records")
    .update({ source_version: data.source_version + 1 })
    .eq("id", recordId)
    .eq("user_id", userId);
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

const createSchema = z.object({
  projectId: z.uuid(),
  evidenceType: z.enum(EVIDENCE_RECORD_TYPE_VALUES),
  title: z.string().trim().max(MAX_EVIDENCE_RECORD_TITLE_LENGTH).optional(),
  body: z.string().trim().max(MAX_EVIDENCE_RECORD_BODY_LENGTH).optional(),
});

/**
 * Creates one evidence record and uploads its files. Body-or-file is
 * required (checked here, not only client-side) — an evidence *type* with no
 * detail is represented by no row at all (project.evidence still lists it,
 * displayed as "상세 자료 없음"), never an empty evidence_records row.
 *
 * Partial file failure never rolls back the record or the files that did
 * succeed — the caller retries only the failed files via
 * {@link addFilesToEvidenceRecord}, against this same evidenceRecordId, so a
 * retry can never create a duplicate record.
 */
export async function createEvidenceRecord(
  _prev: EvidenceRecordFormState,
  formData: FormData,
): Promise<EvidenceRecordFormState> {
  const user = await requireUser();

  const parsed = createSchema.safeParse({
    projectId: formData.get("projectId"),
    evidenceType: formData.get("evidenceType"),
    title: formData.get("title") || undefined,
    body: formData.get("body") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }

  const project = await getProject(parsed.data.projectId, user.id);
  const files = extractFiles(formData);

  if (!parsed.data.body && files.length === 0) {
    return { error: "내용을 적거나 파일을 올려야 자료를 저장할 수 있어요." };
  }

  const userContext = parseUserContext(formData);
  const title = parsed.data.title || defaultTitle(parsed.data.evidenceType, files[0]?.name ?? null);

  const supabase = await createClient();
  const { data: record, error: insertError } = await supabase
    .from("evidence_records")
    .insert({
      project_id: project.id,
      user_id: user.id,
      evidence_type: parsed.data.evidenceType,
      title,
      body: parsed.data.body || null,
      user_context: userContext,
    })
    .select("id")
    .single();

  if (insertError || !record) {
    return { error: "자료를 저장하지 못했습니다. 다시 시도해 주세요." };
  }

  const fileResults: FileUploadResult[] = [];
  for (const file of files) {
    fileResults.push(await uploadOneEvidenceFile(supabase, user.id, project.id, record.id, file));
  }

  revalidatePath(`/projects/${project.id}`);
  return { evidenceRecordId: record.id, title, fileResults };
}

// ---------------------------------------------------------------------------
// Retry / add more files to an existing record
// ---------------------------------------------------------------------------

const addFilesSchema = z.object({
  evidenceRecordId: z.uuid(),
  projectId: z.uuid(),
});

export async function addFilesToEvidenceRecord(
  _prev: EvidenceRecordFormState,
  formData: FormData,
): Promise<EvidenceRecordFormState> {
  const user = await requireUser();
  const parsed = addFilesSchema.safeParse({
    evidenceRecordId: formData.get("evidenceRecordId"),
    projectId: formData.get("projectId"),
  });
  if (!parsed.success) return { error: "입력값을 확인해 주세요." };

  const record = await getEvidenceRecord(parsed.data.evidenceRecordId, user.id);
  if (!record || record.project_id !== parsed.data.projectId) {
    return { error: "자료를 찾을 수 없습니다." };
  }

  const files = extractFiles(formData);
  if (files.length === 0) return { error: "올릴 파일을 선택해 주세요." };

  const supabase = await createClient();
  const fileResults: FileUploadResult[] = [];
  for (const file of files) {
    fileResults.push(await uploadOneEvidenceFile(supabase, user.id, record.project_id, record.id, file));
  }
  if (fileResults.some((r) => r.status === "uploaded")) {
    await bumpSourceVersion(supabase, record.id, user.id);
  }

  revalidatePath(`/projects/${record.project_id}`);
  return { evidenceRecordId: record.id, fileResults };
}

// ---------------------------------------------------------------------------
// Update (title / body / user_context)
// ---------------------------------------------------------------------------

const updateSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  title: z.string().trim().min(1, "제목을 입력해 주세요.").max(MAX_EVIDENCE_RECORD_TITLE_LENGTH),
  body: z.string().trim().max(MAX_EVIDENCE_RECORD_BODY_LENGTH).optional(),
});

export async function updateEvidenceRecord(
  _prev: EvidenceRecordSimpleState,
  formData: FormData,
): Promise<EvidenceRecordSimpleState> {
  const user = await requireUser();
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    body: formData.get("body") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }

  const record = await getEvidenceRecord(parsed.data.id, user.id);
  if (!record || record.project_id !== parsed.data.projectId) {
    return { error: "자료를 찾을 수 없습니다." };
  }

  const userContext = parseUserContext(formData);
  const supabase = await createClient();
  if (!parsed.data.body) {
    // Body can be cleared only if the record still has at least one linked
    // attachment — checked cheaply via the join table rather than fetching files.
    const { count } = await supabase
      .from("evidence_record_attachments")
      .select("attachment_id", { count: "exact", head: true })
      .eq("evidence_record_id", record.id)
      .eq("user_id", user.id);
    if (!count) {
      return { error: "내용을 적거나 파일을 남겨 두어야 해요." };
    }
  }

  const { error } = await supabase
    .from("evidence_records")
    .update({
      title: parsed.data.title,
      body: parsed.data.body || null,
      user_context: userContext,
      source_version: record.source_version + 1,
    })
    .eq("id", record.id)
    .eq("user_id", user.id);

  if (error) return { error: "저장하지 못했습니다. 다시 시도해 주세요." };

  revalidatePath(`/projects/${record.project_id}`);
  return { saved: true };
}

// ---------------------------------------------------------------------------
// Delete record / unlink or link an attachment
// ---------------------------------------------------------------------------

/** Deletes the record only — never the underlying attachments/storage (see evidence_record_attachments' on-delete-cascade: only the *link* rows go). */
export async function deleteEvidenceRecord(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  if (!id || !projectId) return;

  const supabase = await createClient();
  await supabase.from("evidence_records").delete().eq("id", id).eq("user_id", user.id);

  revalidatePath(`/projects/${projectId}`);
}

/** Removes only the link — the file itself, and any other record referencing it, are untouched. */
export async function unlinkEvidenceAttachment(formData: FormData) {
  const user = await requireUser();
  const evidenceRecordId = String(formData.get("evidenceRecordId") ?? "");
  const attachmentId = String(formData.get("attachmentId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  if (!evidenceRecordId || !attachmentId || !projectId) return;

  const supabase = await createClient();
  await supabase
    .from("evidence_record_attachments")
    .delete()
    .eq("evidence_record_id", evidenceRecordId)
    .eq("attachment_id", attachmentId)
    .eq("user_id", user.id);
  await bumpSourceVersion(supabase, evidenceRecordId, user.id);

  revalidatePath(`/projects/${projectId}`);
}

const linkSchema = z.object({
  evidenceRecordId: z.uuid(),
  attachmentId: z.uuid(),
  projectId: z.uuid(),
});

/** Links an existing (already-uploaded) attachment to a record — never re-uploads or copies the file. */
export async function linkExistingAttachment(
  _prev: EvidenceRecordSimpleState,
  formData: FormData,
): Promise<EvidenceRecordSimpleState> {
  const user = await requireUser();
  const parsed = linkSchema.safeParse({
    evidenceRecordId: formData.get("evidenceRecordId"),
    attachmentId: formData.get("attachmentId"),
    projectId: formData.get("projectId"),
  });
  if (!parsed.success) return { error: "입력값을 확인해 주세요." };

  const record = await getEvidenceRecord(parsed.data.evidenceRecordId, user.id);
  if (!record || record.project_id !== parsed.data.projectId) {
    return { error: "자료를 찾을 수 없습니다." };
  }

  const supabase = await createClient();
  const { data: attachment } = await supabase
    .from("project_attachments")
    .select("id")
    .eq("id", parsed.data.attachmentId)
    .eq("user_id", user.id)
    .eq("project_id", parsed.data.projectId)
    .maybeSingle();
  if (!attachment) return { error: "첨부 자료를 찾을 수 없습니다." };

  const { error } = await supabase.from("evidence_record_attachments").upsert(
    { evidence_record_id: record.id, attachment_id: attachment.id, user_id: user.id },
    { onConflict: "evidence_record_id,attachment_id" },
  );
  if (error) return { error: "연결하지 못했습니다. 다시 시도해 주세요." };

  await bumpSourceVersion(supabase, record.id, user.id);
  revalidatePath(`/projects/${parsed.data.projectId}`);
  return { saved: true };
}

// ---------------------------------------------------------------------------
// AI로 정리 — user-triggered only, never automatic on page load/refresh.
// ---------------------------------------------------------------------------

const EVIDENCE_ANALYSIS_LOCK_MS = 90_000;

async function claimEvidenceAnalysis(
  supabase: Client,
  recordId: string,
  userId: string,
): Promise<string | null> {
  const runId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const lockExpiresIso = new Date(Date.now() + EVIDENCE_ANALYSIS_LOCK_MS).toISOString();

  const { data } = await supabase
    .from("evidence_records")
    .update({ analysis_status: "analyzing", analysis_run_id: runId, analysis_lock_expires_at: lockExpiresIso })
    .eq("id", recordId)
    .eq("user_id", userId)
    .or(`analysis_status.neq.analyzing,analysis_lock_expires_at.lt.${nowIso}`)
    .select("id")
    .maybeSingle();

  return data ? runId : null;
}

async function finalizeEvidenceAnalysis(
  supabase: Client,
  recordId: string,
  runId: string,
  patch: Partial<EvidenceRecordRow>,
): Promise<void> {
  await supabase.from("evidence_records").update(patch).eq("id", recordId).eq("analysis_run_id", runId);
}

const analyzeSchema = z.object({ id: z.uuid(), projectId: z.uuid() });

export async function analyzeEvidenceRecord(
  _prev: EvidenceRecordSimpleState,
  formData: FormData,
): Promise<EvidenceRecordSimpleState> {
  const user = await requireUser();
  const parsed = analyzeSchema.safeParse({ id: formData.get("id"), projectId: formData.get("projectId") });
  if (!parsed.success) return { error: "입력값을 확인해 주세요." };

  const record = await getEvidenceRecord(parsed.data.id, user.id);
  if (!record || record.project_id !== parsed.data.projectId) {
    return { error: "자료를 찾을 수 없습니다." };
  }

  const supabase = await createClient();

  const { data: links } = await supabase
    .from("evidence_record_attachments")
    .select("attachment_id")
    .eq("evidence_record_id", record.id)
    .eq("user_id", user.id);
  const attachmentIds = (links ?? []).map((l) => l.attachment_id);

  let attachmentRows: ProjectAttachmentRow[] = [];
  if (attachmentIds.length > 0) {
    const { data } = await supabase
      .from("project_attachments")
      .select("*")
      .in("id", attachmentIds)
      .eq("user_id", user.id);
    attachmentRows = data ?? [];
  }

  if (!record.body && attachmentRows.length === 0) {
    return { error: "정리할 내용이 없습니다. 글이나 파일을 먼저 추가해 주세요." };
  }

  const runId = await claimEvidenceAnalysis(supabase, record.id, user.id);
  if (!runId) {
    return { error: "이미 정리가 진행 중입니다. 잠시 후 다시 확인해 주세요." };
  }

  try {
    const { files, results } = await loadAttachmentFiles(supabase, attachmentRows);

    const bodySourceId = record.body ? `evidence_record_body:${record.id}` : null;
    const allowedSourceIds = new Set<string>([
      ...(bodySourceId ? [bodySourceId] : []),
      ...attachmentRows.map((a) => `attachment:${a.id}`),
    ]);

    const userContextText = [
      `날짜: ${record.user_context.occurred_at ?? "모름"}`,
      `대상: ${record.user_context.target_description ?? "모름"}`,
      `인터뷰/응답 횟수: ${record.user_context.interview_count ?? "모름"}`,
      `고유 참여자 수: ${record.user_context.unique_participant_count ?? "모름"}`,
    ].join(" · ");

    const provider = getAIProvider();
    const modelVersion = provider.name === "mock" ? "mock" : geminiModel();

    const rawDraft = await provider.generateStructured({
      kind: "evidence_record_v2",
      system: evidenceRecordSystemV2(record.evidence_type),
      prompt: buildEvidenceRecordPromptV2({
        evidenceTypeLabel: EVIDENCE_LABEL[record.evidence_type],
        title: record.title,
        bodySourceId,
        body: record.body,
        userContextText,
        attachmentSources: results.map((r) => ({
          sourceId: `attachment:${r.attachmentId}`,
          fileName: r.fileName,
          loadStatus: r.status,
        })),
      }),
      schema: EvidenceRecordDraftV2Schema,
      effort: "low",
      files,
    });

    const { draft: sanitized } = sanitizeEvidenceRecordDraftV2(rawDraft, allowedSourceIds);
    const draft = coerceUnknownCounts(sanitized);

    await finalizeEvidenceAnalysis(supabase, record.id, runId, {
      analysis_status: "completed",
      ai_draft: draft,
      ai_draft_prompt_version: EVIDENCE_RECORD_PROMPT_VERSION_V2,
      ai_draft_model_version: modelVersion,
      ai_draft_source_version: record.source_version,
    });

    revalidatePath(`/projects/${record.project_id}`);
    return { saved: true };
  } catch {
    await finalizeEvidenceAnalysis(supabase, record.id, runId, { analysis_status: "failed" });
    revalidatePath(`/projects/${record.project_id}`);
    return { error: "AI 정리에 실패했습니다. 다시 시도해 주세요." };
  }
}

// ---------------------------------------------------------------------------
// 확인 후 저장 — the founder reviews (and may edit) the AI draft, or fills the
// same fields in by hand without ever running AI로 정리. Either way this is
// the founder's own confirmation, never treated as objective verification.
// ---------------------------------------------------------------------------

const linesToArray = (raw: FormDataEntryValue | null, max: number): string[] =>
  String(raw ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, max);

const confirmSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  what: z.string().trim().max(2000).optional(),
  whenText: z.string().trim().max(200).optional(),
  whoDescription: z.string().trim().max(500).optional(),
  interviewCountKnown: z.string().optional(),
  interviewCountValue: z.string().optional(),
  uniqueParticipantCountKnown: z.string().optional(),
  uniqueParticipantCountValue: z.string().optional(),
  purpose: z.string().trim().max(2000).optional(),
  purchaseSignal: z.string().optional(),
  summary: z.string().trim().max(4000),
});

export async function confirmEvidenceSummary(
  _prev: EvidenceRecordSimpleState,
  formData: FormData,
): Promise<EvidenceRecordSimpleState> {
  const user = await requireUser();
  const parsed = confirmSchema.safeParse({
    id: formData.get("id"),
    projectId: formData.get("projectId"),
    what: formData.get("what") || undefined,
    whenText: formData.get("whenText") || undefined,
    whoDescription: formData.get("whoDescription") || undefined,
    interviewCountKnown: formData.get("interviewCountKnown") || undefined,
    interviewCountValue: formData.get("interviewCountValue") || undefined,
    uniqueParticipantCountKnown: formData.get("uniqueParticipantCountKnown") || undefined,
    uniqueParticipantCountValue: formData.get("uniqueParticipantCountValue") || undefined,
    purpose: formData.get("purpose") || undefined,
    purchaseSignal: formData.get("purchaseSignal") || undefined,
    summary: formData.get("summary") || "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }

  const record = await getEvidenceRecord(parsed.data.id, user.id);
  if (!record || record.project_id !== parsed.data.projectId) {
    return { error: "자료를 찾을 수 없습니다." };
  }

  const existingDraft = (record.ai_draft as EvidenceRecordDraftV2 | null) ?? null;
  const purchaseSignalParsed = parsed.data.purchaseSignal
    ? purchaseSignalV2.safeParse(parsed.data.purchaseSignal)
    : null;

  const draftInput: EvidenceRecordDraftV2 = {
    what: parsed.data.what ?? null,
    when_text: parsed.data.whenText ?? null,
    who_description: parsed.data.whoDescription ?? null,
    interview_count: {
      known: parsed.data.interviewCountKnown === "true",
      value:
        parsed.data.interviewCountKnown === "true"
          ? optionalPositiveInt(parsed.data.interviewCountValue)
          : null,
    },
    unique_participant_count: {
      known: parsed.data.uniqueParticipantCountKnown === "true",
      value:
        parsed.data.uniqueParticipantCountKnown === "true"
          ? optionalPositiveInt(parsed.data.uniqueParticipantCountValue)
          : null,
    },
    purpose: parsed.data.purpose ?? null,
    method: existingDraft?.method ?? [],
    key_results: linesToArray(formData.get("keyResults"), 20),
    metrics: existingDraft?.metrics ?? [],
    quotes: existingDraft?.quotes ?? [],
    conflicting_points: existingDraft?.conflicting_points ?? [],
    unknowns: linesToArray(formData.get("unknowns"), 20),
    duplicate_suspected: existingDraft?.duplicate_suspected ?? { suspected: false, reason: null },
    purchase_signal: purchaseSignalParsed?.success ? purchaseSignalParsed.data : null,
    summary: parsed.data.summary,
  };

  const validated = EvidenceRecordDraftV2Schema.safeParse(draftInput);
  if (!validated.success) {
    return { error: "입력값을 확인해 주세요." };
  }

  // The confirmed when/who/counts also sync into user_context (the same
  // "founder confirmed" facts shown elsewhere) — this does NOT bump
  // source_version, since syncing the founder's own confirmation is not a
  // new edit to re-analyze; confirmed_source_version stays tied to the
  // record's current (unchanged) source_version.
  const syncedUserContext = {
    occurred_at: validated.data.when_text,
    target_description: validated.data.who_description,
    interview_count: validated.data.interview_count.known ? validated.data.interview_count.value : null,
    unique_participant_count: validated.data.unique_participant_count.known
      ? validated.data.unique_participant_count.value
      : null,
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("evidence_records")
    .update({
      user_confirmed_summary: validated.data,
      confirmed_at: new Date().toISOString(),
      confirmed_source_version: record.source_version,
      user_context: syncedUserContext,
    })
    .eq("id", record.id)
    .eq("user_id", user.id);

  if (error) return { error: "저장하지 못했습니다. 다시 시도해 주세요." };

  revalidatePath(`/projects/${record.project_id}`);
  return { saved: true };
}

export type { EvidenceRecordRow };
