"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProject } from "@/lib/data/projects";
import { getSession, getResult, listAnswers } from "@/lib/data/diagnosis";
import { listAttachments } from "@/lib/data/attachments";
import {
  generateQuestionBatch,
  loadAttachmentFiles,
  pendingQuestion,
} from "@/lib/diagnosis/service";
import { MAX_QUESTIONS } from "@/lib/domain/constants";
import type { DiagnosisAnswerRow, QuestionType } from "@/lib/types/database";

export interface QuestionView {
  id: string;
  orderIndex: number;
  question: string;
  reason: string | null;
  questionType: QuestionType;
  options: string[];
}

export type DiagnosisStep =
  | {
      type: "question";
      question: QuestionView;
      askedCount: number;
      maxQuestions: number;
    }
  | { type: "ready"; askedCount: number; maxQuestions: number }
  | { type: "completed" }
  | { type: "error"; message: string };

function toView(row: DiagnosisAnswerRow): QuestionView {
  return {
    id: row.id,
    orderIndex: row.order_index,
    question: row.question,
    reason: row.question_reason,
    questionType: row.question_type,
    options: row.options ?? [],
  };
}

export async function startDiagnosis(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) throw new Error("projectId가 필요합니다.");

  // Ownership is verified here as well as by RLS.
  const project = await getProject(projectId, user.id);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("diagnosis_sessions")
    .insert({
      project_id: project.id,
      user_id: user.id,
      max_questions: MAX_QUESTIONS,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`진단을 시작하지 못했습니다: ${error?.message ?? "unknown"}`);
  }

  revalidatePath(`/projects/${project.id}`);
  redirect(`/projects/${project.id}/diagnosis/${data.id}`);
}

/** Returns the current step, generating the next question when needed. */
export async function advanceDiagnosis(sessionId: string): Promise<DiagnosisStep> {
  const user = await requireUser();
  const session = await getSession(sessionId, user.id);

  if (session.status === "completed") return { type: "completed" };

  const [project, answers] = await Promise.all([
    getProject(session.project_id, user.id),
    listAnswers(sessionId, user.id),
  ]);

  const askedCount = answers.filter((row) => row.answer !== null).length;

  if (session.status === "analyzing" || session.status === "failed") {
    return { type: "ready", askedCount, maxQuestions: session.max_questions };
  }

  // The whole interview is planned once, up front — a reloaded session never
  // waits on the model again after this.
  if (answers.length > 0) {
    const pending = pendingQuestion(answers);
    if (pending) {
      return {
        type: "question",
        question: toView(pending),
        askedCount,
        maxQuestions: session.max_questions,
      };
    }
    return { type: "ready", askedCount, maxQuestions: session.max_questions };
  }

  const supabase = await createClient();

  try {
    const attachments = await listAttachments(project.id, user.id);
    const files = await loadAttachmentFiles(supabase, attachments);
    const planned = await generateQuestionBatch(supabase, session, project, attachments, files);
    const first = pendingQuestion(planned);
    if (!first) {
      return { type: "ready", askedCount, maxQuestions: session.max_questions };
    }
    return {
      type: "question",
      question: toView(first),
      askedCount,
      maxQuestions: session.max_questions,
    };
  } catch (error) {
    // A concurrent request may have inserted the same batch first.
    const fresh = pendingQuestion(await listAnswers(sessionId, user.id));
    if (fresh) {
      return {
        type: "question",
        question: toView(fresh),
        askedCount,
        maxQuestions: session.max_questions,
      };
    }
    console.error("advanceDiagnosis failed", error);
    return {
      type: "error",
      message: "질문을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
}

const answerSchema = z.object({
  sessionId: z.uuid(),
  answerId: z.uuid(),
  answer: z.string().trim().min(1, "답변을 입력해 주세요.").max(2000),
});

export async function submitAnswer(input: {
  sessionId: string;
  answerId: string;
  answer: string;
}): Promise<DiagnosisStep> {
  const parsed = answerSchema.safeParse(input);
  if (!parsed.success) {
    return { type: "error", message: parsed.error.issues[0]?.message ?? "답변을 확인해 주세요." };
  }

  const user = await requireUser();
  const session = await getSession(parsed.data.sessionId, user.id);
  if (session.status !== "questioning") {
    return advanceDiagnosis(parsed.data.sessionId);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("diagnosis_answers")
    .update({ answer: parsed.data.answer, answered_at: new Date().toISOString() })
    .eq("id", parsed.data.answerId)
    .eq("session_id", parsed.data.sessionId)
    .eq("user_id", user.id)
    .is("answer", null);

  if (error) {
    return { type: "error", message: "답변을 저장하지 못했습니다. 다시 시도해 주세요." };
  }

  return advanceDiagnosis(parsed.data.sessionId);
}

export interface VerificationFormState {
  error?: string;
}

const verificationSchema = z.object({
  sessionId: z.uuid(),
  verification: z.string().trim().min(1, "검증 결과를 입력해 주세요.").max(4000),
  newConcern: z.string().trim().max(4000).optional(),
});

/**
 * Closes the loop: records how the previous experiment turned out (and any new
 * concern) as an attachment on the project, then starts the next diagnosis
 * round so those become evidence for the following report.
 */
export async function submitVerification(
  _prev: VerificationFormState,
  formData: FormData,
): Promise<VerificationFormState> {
  const user = await requireUser();

  const parsed = verificationSchema.safeParse({
    sessionId: formData.get("sessionId"),
    verification: formData.get("verification"),
    newConcern: formData.get("newConcern") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }

  const session = await getSession(parsed.data.sessionId, user.id);
  const [project, result] = await Promise.all([
    getProject(session.project_id, user.id),
    getResult(parsed.data.sessionId, user.id),
  ]);
  if (!result) {
    return { error: "완료된 진단 리포트에서만 검증 결과를 남길 수 있습니다." };
  }

  const supabase = await createClient();
  const experiment = result.next_experiment;
  const verificationNote = `이전 실험: ${experiment.title}\n가설: ${experiment.hypothesis}\n\n검증 결과: ${parsed.data.verification}`.slice(
    0,
    4000,
  );

  const rows = [
    {
      project_id: project.id,
      user_id: user.id,
      kind: "verification" as const,
      note: verificationNote,
    },
    ...(parsed.data.newConcern
      ? [
          {
            project_id: project.id,
            user_id: user.id,
            kind: "concern" as const,
            note: parsed.data.newConcern,
          },
        ]
      : []),
  ];

  const { error: attachmentError } = await supabase.from("project_attachments").insert(rows);
  if (attachmentError) {
    return { error: "검증 결과를 저장하지 못했습니다. 다시 시도해 주세요." };
  }

  const { data: nextSession, error: sessionError } = await supabase
    .from("diagnosis_sessions")
    .insert({ project_id: project.id, user_id: user.id, max_questions: MAX_QUESTIONS })
    .select("id")
    .single();

  if (sessionError || !nextSession) {
    return { error: "다음 진단을 시작하지 못했습니다. 다시 시도해 주세요." };
  }

  revalidatePath(`/projects/${project.id}`);
  redirect(`/projects/${project.id}/diagnosis/${nextSession.id}`);
}
