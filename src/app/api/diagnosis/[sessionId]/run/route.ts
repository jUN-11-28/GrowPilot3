import { NextResponse, type NextRequest } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { runDiagnosisPipeline } from "@/lib/ai/pipeline";
import type { PipelineStep } from "@/lib/ai/steps";
import {
  buildContext,
  loadAttachmentFiles,
  searchResourcesByBottleneck,
} from "@/lib/diagnosis/service";

/** The pipeline runs five sequential model calls; give it room. */
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

  // Resources are not prefetched: the Resource Agent searches them mid-pipeline,
  // once the bottleneck has been confirmed and turned into search tags.
  const [{ data: project }, { data: answers }, { data: attachments }] = await Promise.all([
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
  ]);

  if (!project) {
    return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  }

  await supabase
    .from("diagnosis_sessions")
    .update({ status: "analyzing", error_message: null })
    .eq("id", sessionId)
    .eq("user_id", user.id);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };

      try {
        const attachmentRows = attachments ?? [];
        const attachmentFiles = await loadAttachmentFiles(supabase, attachmentRows);

        const outcome = await runDiagnosisPipeline({
          context: buildContext(project, answers ?? [], attachmentRows),
          searchResources: (query) => searchResourcesByBottleneck(supabase, query),
          attachmentFiles,
          onStep: (step: PipelineStep, phase, detail) =>
            send({ type: "step", step, phase, detail }),
        });

        const { synthesis } = outcome;
        const { data: inserted, error } = await supabase
          .from("diagnosis_results")
          .insert({
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
          })
          .select("id")
          .single();

        if (error || !inserted) {
          throw new Error(error?.message ?? "결과 저장 실패");
        }

        await supabase
          .from("diagnosis_sessions")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", sessionId)
          .eq("user_id", user.id);

        send({ type: "done", resultId: inserted.id });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
        console.error("diagnosis pipeline failed", error);

        await supabase
          .from("diagnosis_sessions")
          .update({ status: "failed", error_message: message.slice(0, 500) })
          .eq("id", sessionId)
          .eq("user_id", user.id);

        send({ type: "error", message: "진단 분석에 실패했습니다. 다시 시도해 주세요." });
      } finally {
        controller.close();
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
