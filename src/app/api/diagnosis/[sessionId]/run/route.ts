import { NextResponse, type NextRequest } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { diagnosisSchemaVersion } from "@/lib/env";
import { runDiagnosisPipeline } from "@/lib/ai/pipeline";
import { runDiagnosisPipelineV2 } from "@/lib/ai/pipeline-v2";
import { buildContextV2 } from "@/lib/ai/context-v2";
import { buildEvidenceLookup, serializeSynthesisV2ToLegacyColumns } from "@/lib/ai/serialize-v2";
import type { PipelineStep } from "@/lib/ai/steps";
import {
  buildContext,
  claimAnalysisRun,
  finalizeAnalysisRun,
  loadAttachmentFiles,
  searchResourcesByBottleneck,
  searchResourcesByBottleneckV2,
} from "@/lib/diagnosis/service";
import { listEvidenceRecordAttachmentLinks, listEvidenceRecords } from "@/lib/data/evidence-records";
import type { Database } from "@/lib/types/database";

type DiagnosisResultInsert = Database["public"]["Tables"]["diagnosis_results"]["Insert"];

/**
 * The pipeline runs six sequential model calls (v1 and v2 alike), each capped
 * at 120s by provider.ts's httpOptions.timeout, plus up to one repair call
 * per step on a schema-validation failure. In the worst case that is well
 * past this route's 300s budget — this does not make that worst case finish
 * in time, it only makes sure a request the platform kills is *reclaimable*
 * quickly afterward (see ANALYSIS_LOCK_DURATION_MS in service.ts) instead of
 * leaving the session stuck "analyzing" until a human intervenes.
 */
export const maxDuration = 300;

type Params = { params: Promise<{ sessionId: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  const { sessionId } = await params;

  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const supabase = await createClient();

  // Ownership is checked here on the server, not only by RLS or proxy.ts.
  const { data: session } = await supabase
    .from("diagnosis_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: "진단 세션을 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("diagnosis_results")
    .select("id")
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    return streamOf([{ type: "done", resultId: existing.id }]);
  }

  const schemaVersion = diagnosisSchemaVersion();

  // Resources are not prefetched: the Resource Agent searches them mid-pipeline,
  // once the bottleneck has been confirmed and turned into search tags.
  const [
    { data: project },
    { data: answers },
    { data: attachments },
    { data: priorResults },
    { data: experimentRuns },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("id", session.project_id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("diagnosis_answers")
      .select("*")
      .eq("session_id", sessionId)
      .eq("user_id", user.id)
      .order("order_index", { ascending: true }),
    supabase
      .from("project_attachments")
      .select("*")
      .eq("project_id", session.project_id)
      .eq("user_id", user.id),
    // v2 only needs these two, but they're cheap indexed queries either way
    // and keeping them unconditional avoids a second round trip mid-stream.
    schemaVersion === 2
      ? supabase
          .from("diagnosis_results")
          .select("id, created_at, current_stage, critical_bottleneck, next_experiment")
          .eq("project_id", session.project_id)
          .eq("user_id", user.id)
          .neq("session_id", sessionId)
          .order("created_at", { ascending: false })
          .limit(3)
      : Promise.resolve({ data: null }),
    schemaVersion === 2
      ? supabase
          .from("experiment_runs")
          .select("id, created_at, execution_status, outcome, observed_result, interpretation, new_concern")
          .eq("project_id", session.project_id)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: null }),
  ]);

  if (!project) {
    return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  }

  // The question phase must be server-confirmed complete and fully answered
  // before analysis starts — a request that skipped the UI (or a stale tab
  // resubmitting) must not be able to trigger analysis on a partial interview.
  const answerRows = answers ?? [];
  const hasUnanswered = answerRows.some((row) => row.answer === null);
  if (session.question_status !== "completed" || hasUnanswered) {
    return NextResponse.json(
      { error: "질문에 모두 답변한 뒤에 분석을 시작할 수 있습니다." },
      { status: 409 },
    );
  }

  // Atomic claim: only the request that wins this update actually calls the
  // model. A request that loses the race (concurrent tab, or a retry that
  // arrives while a still-valid lease is held) must not start a second
  // pipeline run — see service.ts's claimAnalysisRun for the lease mechanics.
  const runId = await claimAnalysisRun(supabase, sessionId, user.id);
  if (!runId) {
    return streamOf([{ type: "in_progress" }]);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // A disconnected client makes `enqueue`/`close` throw. That must never
      // surface as (or mask) a pipeline failure — there is simply no one left
      // to deliver the message to, and the DB writes below are what actually
      // decide the outcome, independent of whether the stream could still be
      // written to.
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        } catch {
          // ignore — see comment above
        }
      };

      try {
        const attachmentRows = attachments ?? [];
        const onStep = (step: PipelineStep, phase: "start" | "done", detail?: string) =>
          send({ type: "step", step, phase, detail });

        let insertPayload: DiagnosisResultInsert;

        if (schemaVersion === 2) {
          const { files: attachmentFiles, results: attachmentLoadResults } =
            await loadAttachmentFiles(supabase, attachmentRows);
          const [evidenceRecordRows, evidenceRecordAttachmentRows] = await Promise.all([
            listEvidenceRecords(project.id, user.id),
            listEvidenceRecordAttachmentLinks(project.id, user.id),
          ]);
          const nowIso = new Date().toISOString();
          const context = buildContextV2({
            project,
            answers: answers ?? [],
            attachmentRows,
            attachmentLoadResults,
            priorResults: priorResults ?? [],
            experimentRunRows: experimentRuns ?? [],
            evidenceRecordRows,
            evidenceRecordAttachmentRows,
            nowIso,
          });

          const outcome = await runDiagnosisPipelineV2({
            context,
            searchResources: (query) => searchResourcesByBottleneckV2(supabase, query),
            attachmentFiles,
            onStep,
          });

          if (outcome.issues.length > 0) {
            console.warn(
              `[diagnosis v2] session=${sessionId} non-fatal issues:`,
              outcome.issues,
            );
          }

          const legacy = serializeSynthesisV2ToLegacyColumns(
            outcome.synthesis,
            buildEvidenceLookup(outcome.evidence),
          );

          insertPayload = {
            session_id: sessionId,
            project_id: project.id,
            user_id: user.id,
            ...legacy,
            recommended_resource_ids: outcome.recommendedResourceIds,
            agent_trace: JSON.parse(JSON.stringify(outcome.trace)),
            schema_version: 2,
            report_v2: JSON.parse(JSON.stringify(outcome.synthesis)),
            input_snapshot: JSON.parse(JSON.stringify(context)),
            prompt_version: outcome.trace.prompt_version,
            model_version: outcome.trace.model_version,
          };
        } else {
          const { files: attachmentFiles } = await loadAttachmentFiles(supabase, attachmentRows);

          const outcome = await runDiagnosisPipeline({
            context: buildContext(project, answers ?? [], attachmentRows),
            searchResources: (query) => searchResourcesByBottleneck(supabase, query),
            attachmentFiles,
            onStep,
          });

          const { synthesis } = outcome;
          insertPayload = {
            session_id: sessionId,
            project_id: project.id,
            user_id: user.id,
            current_stage: synthesis.current_stage,
            stage_confidence: synthesis.stage_confidence,
            evidence_confidence: synthesis.evidence_confidence,
            critical_bottleneck: synthesis.critical_bottleneck,
            bottleneck_reason: synthesis.bottleneck_reason,
            supporting_evidence: synthesis.supporting_evidence,
            missing_evidence: synthesis.missing_evidence,
            lean_analyst_opinion: synthesis.lean_analyst_opinion,
            red_team_counterargument: synthesis.red_team_counterargument,
            next_experiment: synthesis.next_experiment,
            recommended_resource_ids: outcome.recommendedResourceIds,
            agent_trace: JSON.parse(JSON.stringify(outcome.trace)),
          };
        }

        const { data: inserted, error } = await supabase
          .from("diagnosis_results")
          .insert(insertPayload)
          .select("id")
          .single();

        if (error || !inserted) {
          // The insert itself failed, or partially failed in a way that left
          // no row to reference — either way there is nothing to mark
          // completed. Falls through to the catch below, which marks the
          // session failed (scoped to this runId) so a retry is possible.
          throw new Error(error?.message ?? "결과 저장 실패");
        }

        // Scoped to `runId`: if this run's lease expired and was reclaimed by
        // a later request before this point, that later run's state must not
        // be overwritten by this (stale) one finishing late.
        await finalizeAnalysisRun(supabase, sessionId, user.id, runId, {
          status: "completed",
          completedAt: new Date().toISOString(),
        });

        send({ type: "done", resultId: inserted.id });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
        console.error("diagnosis pipeline failed", error);

        await finalizeAnalysisRun(supabase, sessionId, user.id, runId, {
          status: "failed",
          errorMessage: message.slice(0, 500),
        });

        send({ type: "error", message: "진단 분석에 실패했습니다. 다시 시도해 주세요." });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed or errored (client disconnected) — nothing to do.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function streamOf(events: unknown[]) {
  const body = events.map((event) => `${JSON.stringify(event)}\n`).join("");
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
