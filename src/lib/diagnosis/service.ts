import "server-only";

import { getAIProvider, type InlineFile } from "@/lib/ai/provider";
import { QuestionBatchSchema } from "@/lib/ai/schemas";
import {
  buildQuestionPrompt,
  questionSystem,
} from "@/lib/ai/prompts/question";
import type { AttachmentSummary, DiagnosisContext } from "@/lib/ai/context";
import { ALLOWED_ATTACHMENT_MIME_TYPES, MAX_ATTACHMENT_BYTES } from "@/lib/domain/constants";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  DiagnosisAnswerRow,
  DiagnosisSessionRow,
  ProjectAttachmentRow,
  ProjectRow,
} from "@/lib/types/database";

type Client = SupabaseClient<Database>;

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
 * Downloads attachments the model can read inline (images, PDF, plain text)
 * and base64-encodes them, capped so a single request never explodes.
 */
export async function loadAttachmentFiles(
  supabase: Client,
  attachments: ProjectAttachmentRow[],
): Promise<InlineFile[]> {
  const allowed = new Set<string>(ALLOWED_ATTACHMENT_MIME_TYPES);
  const files: InlineFile[] = [];
  let totalBytes = 0;

  for (const attachment of attachments) {
    if (!attachment.storage_path || !attachment.mime_type) continue;
    if (!allowed.has(attachment.mime_type)) continue;
    if (totalBytes + (attachment.byte_size ?? 0) > MAX_ATTACHMENT_BYTES) continue;

    const { data, error } = await supabase.storage
      .from("attachments")
      .download(attachment.storage_path);
    if (error || !data) continue;

    const buffer = Buffer.from(await data.arrayBuffer());
    totalBytes += buffer.byteLength;
    files.push({ mimeType: attachment.mime_type, base64: buffer.toString("base64") });
  }

  return files;
}

/**
 * Plans the whole interview (up to MAX_QUESTIONS) in a single call and persists
 * every question at once, so a reloaded session resumes without ever waiting on
 * the model again — only the first render of the session pays for generation.
 * Returns the rows so the caller doesn't need a second read.
 */
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
