"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSession, getResult } from "@/lib/data/diagnosis";
import { ExperimentResultInputSchema } from "@/lib/ai/schemas-v2";
import { MAX_QUESTIONS } from "@/lib/domain/constants";

export interface ExperimentResultFormState {
  error?: string;
  /** Set only for the "save only" intent — "start next diagnosis" always redirects instead. */
  saved?: boolean;
}

/**
 * v2 — records how a founder's execution of a previously issued
 * `next_experiment` went, and starts the next diagnosis session, in one
 * atomic step (the `submit_experiment_result` DB function from migration
 * 0005). `idempotencyKey` is generated once client-side and resubmitted
 * unchanged on retry, so a double-click or a retry after a dropped response
 * reuses the same experiment_runs row and the same next session instead of
 * creating duplicates — see `next_session_id` in the RPC's return value.
 *
 * This is the v2-only counterpart to `submitVerification` in
 * lib/actions/diagnosis.ts, which stays exactly as it was for v1 reports
 * (schema_version = 1) — a v1 report has no `experiment_runs` row to attach
 * to, and its next round has no v2 context to receive one.
 */
export async function submitExperimentResultV2(
  _prev: ExperimentResultFormState,
  formData: FormData,
): Promise<ExperimentResultFormState> {
  const user = await requireUser();

  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return { error: "세션을 찾을 수 없습니다." };

  const evidenceRefsRaw = String(formData.get("evidenceRefs") ?? "");
  const parsed = ExperimentResultInputSchema.safeParse({
    executionStatus: formData.get("executionStatus"),
    outcome: formData.get("outcome") || null,
    observedResult: formData.get("observedResult"),
    interpretation: formData.get("interpretation") || null,
    newConcern: formData.get("newConcern") || null,
    evidenceRefs: evidenceRefsRaw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
    idempotencyKey: formData.get("idempotencyKey"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }

  const session = await getSession(sessionId, user.id);
  const result = await getResult(sessionId, user.id);
  if (!result) {
    return { error: "완료된 진단 리포트에서만 실험 결과를 남길 수 있습니다." };
  }
  if (result.schema_version !== 2) {
    return { error: "이 리포트는 이 방식으로 결과를 남길 수 없습니다." };
  }

  const startNextSession = String(formData.get("intent") ?? "start_next") !== "save_only";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_experiment_result", {
    p_source_result_id: result.id,
    p_project_id: session.project_id,
    p_user_id: user.id,
    p_experiment_snapshot: result.report_v2,
    p_execution_status: parsed.data.executionStatus,
    p_outcome: parsed.data.outcome,
    p_observed_result: { text: parsed.data.observedResult },
    p_interpretation: parsed.data.interpretation,
    p_evidence_refs: parsed.data.evidenceRefs,
    p_new_concern: parsed.data.newConcern,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_max_questions: MAX_QUESTIONS,
    p_start_next_session: startNextSession,
  });

  if (error || !data || data.length === 0) {
    return { error: `결과를 저장하지 못했습니다: ${error?.message ?? "알 수 없는 오류"}` };
  }

  if (!startNextSession) {
    return { saved: true };
  }

  redirect(`/projects/${session.project_id}/diagnosis/${data[0].next_session_id}`);
}
