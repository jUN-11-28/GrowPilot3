import { ArrowLeft, Boxes, Check, CircleHelp, FlaskConical, Minus, OctagonX, RefreshCw, Ruler, Target, Users } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { parseAgentTraceV2, parseReportV2 } from "@/lib/ai/trace-v2";
import {
  ACTION_TYPE_LABEL_V2,
  CRITERIA_STATUS_LABEL_V2,
  DIAGNOSIS_STATUS_LABEL_V2,
  FEASIBILITY_STATUS_LABEL_V2,
  GROWTH_STAGE_LABEL,
  READINESS_DIMENSION_LABEL_V2,
  READINESS_STATUS_LABEL_V2,
  RED_TEAM_VERDICT_LABEL_V2,
  RESOURCE_STATUS_LABEL_V2,
} from "@/lib/domain/constants";
import { formatDate } from "@/lib/utils";
import { BoardRow, EvidenceList, ResourceRecommendations, Row, Section } from "./report-ui";
import { VerificationFormV2 } from "./verification-form-v2";
import type {
  DiagnosisAnswerRow,
  DiagnosisResultRow,
  GrowthStage,
  ProjectRow,
  ResourceRow,
} from "@/lib/types/database";

function stageLabelOrHold(stage: string | null | undefined): string {
  if (!stage) return "판단 보류";
  return GROWTH_STAGE_LABEL[stage as GrowthStage] ?? stage;
}

export function ResultV2({
  projectId,
  sessionId,
  project,
  result,
  answers,
  resources,
}: {
  projectId: string;
  sessionId: string;
  project: ProjectRow;
  result: DiagnosisResultRow;
  answers: DiagnosisAnswerRow[];
  resources: ResourceRow[];
}) {
  const report = parseReportV2(result.report_v2);
  const trace = parseAgentTraceV2(result.agent_trace);
  const experiment = report?.next_experiment;

  const pickReasons = new Map(
    (trace.resource?.picks ?? []).map((pick) => [pick.resource_id ?? "", pick.reason]),
  );

  const diagnosisStatus = report?.diagnosis_status;
  const bottleneckLabel = diagnosisStatus
    ? (DIAGNOSIS_STATUS_LABEL_V2[diagnosisStatus] ?? "우선 확인할 과제")
    : "우선 확인할 과제";

  const resourceStatus = trace.resource?.status;
  const resourceEmptyMessage =
    resourceStatus === "no_match"
      ? "이번 행동에 맞는 자원을 찾지 못했어요."
      : resourceStatus === "lookup_failed"
        ? "자원을 불러오지 못했어요. 진단 결과는 확인할 수 있어요."
        : resourceStatus === "needs_verification"
          ? "이용 조건을 추가로 확인해야 해요."
          : "이번 행동에 필요한 외부 도움은 없다고 판단했습니다.";

  return (
    <article className="mx-auto max-w-3xl space-y-14 pb-16">
      <header className="space-y-5 border-b border-line pb-8">
        <Link
          href={`/projects/${projectId}`}
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          {project.name}
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-muted">
              Diagnosis report · v2
            </p>
            <h1 className="text-display font-semibold">{project.name}</h1>
          </div>
          <p className="text-[13px] tabular-nums text-ink-muted">
            {formatDate(result.created_at)} · 질문 {answers.length}개
          </p>
        </div>
      </header>

      <Section number="01" title={bottleneckLabel} icon={Target} lead>
        <div className="rounded-xl border border-critical-line bg-critical-soft p-7 sm:p-9">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-critical">
            {bottleneckLabel}
          </p>
          <h2 className="mt-4 text-[22px] font-semibold leading-snug tracking-tight text-ink sm:text-[27px]">
            {result.critical_bottleneck}
          </h2>
          {report?.evidence_gap ? (
            <div className="mt-6 border-t border-critical-line pt-5">
              <h3 className="text-[13px] font-medium text-ink">Evidence Gap</h3>
              <p className="mt-2 text-[15px] leading-[1.75] text-ink-secondary">
                {report.evidence_gap}
              </p>
            </div>
          ) : null}
          <div className="mt-6 border-t border-critical-line pt-5">
            <h3 className="text-[13px] font-medium text-ink">왜 이것이 먼저인가</h3>
            <p className="mt-2 whitespace-pre-line text-[15px] leading-[1.75] text-ink-secondary">
              {result.bottleneck_reason}
            </p>
          </div>
        </div>
      </Section>

      {experiment ? (
        <Section number="02" title="Next Action" icon={FlaskConical} lead>
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-7 py-6">
              <h2 className="text-[19px] font-semibold leading-snug tracking-tight">
                {experiment.title}
              </h2>
              <div className="flex flex-wrap gap-2">
                {experiment.action_type ? (
                  <Badge tone="accent">{ACTION_TYPE_LABEL_V2[experiment.action_type] ?? experiment.action_type}</Badge>
                ) : null}
                {experiment.execution_window_days ? (
                  <Badge>{experiment.execution_window_days}일 실행</Badge>
                ) : null}
                {experiment.review_after_days ? (
                  <Badge tone="muted">{experiment.review_after_days}일 뒤 점검</Badge>
                ) : null}
              </div>
            </div>

            <dl className="divide-y divide-line">
              <Row term="어떤 결정에">
                <p className="text-[15px] leading-[1.75] text-ink">{experiment.decision_to_inform}</p>
              </Row>
              {experiment.hypothesis ? (
                <Row term="가설">
                  <p className="text-[15px] leading-[1.75] text-ink">{experiment.hypothesis}</p>
                </Row>
              ) : (
                <Row term="가설">
                  <p className="text-[15px] leading-[1.75] text-ink-secondary">
                    이번 행동은 준비·측정·추가 확인이며, 참/거짓을 가릴 가설은 없습니다.
                  </p>
                </Row>
              )}
              {experiment.target_and_recruitment ? (
                <Row term="대상·모집">
                  <p className="text-[15px] leading-[1.7] text-ink-secondary">
                    {experiment.target_and_recruitment}
                  </p>
                </Row>
              ) : null}
              {experiment.method?.length ? (
                <Row term="실행 절차">
                  <ol className="space-y-2.5">
                    {experiment.method.map((item, index) => (
                      <li key={`${index}-${item}`} className="flex gap-3 text-[15px] leading-[1.7] text-ink-secondary">
                        <span className="shrink-0 tabular-nums text-ink-muted">{index + 1}.</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ol>
                </Row>
              ) : null}
              {experiment.metric ? (
                <Row term="측정 지표">
                  <div className="space-y-1.5 text-[15px] leading-[1.7] text-ink-secondary">
                    <p className="text-ink">{experiment.metric.name}</p>
                    {experiment.metric.definition ? <p>정의: {experiment.metric.definition}</p> : null}
                    {experiment.metric.denominator_definition ? (
                      <p>분모: {experiment.metric.denominator_definition}</p>
                    ) : null}
                    {experiment.metric.recording_method ? (
                      <p>기록 방법: {experiment.metric.recording_method}</p>
                    ) : null}
                  </div>
                </Row>
              ) : null}
              {experiment.verification_method ? (
                <Row term="검증 방법">
                  <p className="flex gap-3 text-[15px] leading-[1.7] text-ink-secondary">
                    <Ruler aria-hidden className="mt-1 size-4 shrink-0 text-ink-muted" />
                    <span>{experiment.verification_method}</span>
                  </p>
                </Row>
              ) : null}
              {experiment.success_criteria?.length ? (
                <Row term="성공 기준">
                  <div className="space-y-2">
                    <ul className="space-y-2.5">
                      {experiment.success_criteria.map((item, index) => (
                        <li key={`${index}-${item}`} className="flex gap-3 text-[15px] leading-[1.7] text-ink-secondary">
                          <Check aria-hidden className="mt-1 size-4 shrink-0 text-positive" strokeWidth={2.5} />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    {experiment.criteria_basis ? (
                      <p className="text-[13px] text-ink-muted">
                        기준 근거
                        {experiment.criteria_status
                          ? ` (${CRITERIA_STATUS_LABEL_V2[experiment.criteria_status] ?? experiment.criteria_status})`
                          : ""}
                        : {experiment.criteria_basis}
                      </p>
                    ) : null}
                  </div>
                </Row>
              ) : null}
              {experiment.outcome_rules ? (
                <Row term="결과별 다음 행동">
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <OutcomeRule label="지지" value={experiment.outcome_rules.supports} />
                    <OutcomeRule label="반증" value={experiment.outcome_rules.does_not_support} />
                    <OutcomeRule label="불확실" value={experiment.outcome_rules.inconclusive} />
                    <OutcomeRule label="미완료" value={experiment.outcome_rules.incomplete} />
                  </dl>
                </Row>
              ) : null}
              {experiment.observation_window_days || experiment.observation_end_condition ? (
                <Row term="실제 관찰 기간">
                  <p className="text-[15px] leading-[1.7] text-ink-secondary">
                    {experiment.observation_window_days
                      ? `약 ${experiment.observation_window_days}일. `
                      : ""}
                    {experiment.observation_end_condition ?? ""}
                    <span className="mt-1 block text-[13px] text-ink-muted">
                      {experiment.execution_window_days}일 실행/점검과는 별개의 관찰 기간입니다.
                    </span>
                  </p>
                </Row>
              ) : null}
              {experiment.stop_condition ? (
                <Row term="중단 조건">
                  <p className="flex gap-3 text-[15px] leading-[1.7] text-ink-secondary">
                    <OctagonX aria-hidden className="mt-1 size-4 shrink-0 text-critical" />
                    <span>{experiment.stop_condition}</span>
                  </p>
                </Row>
              ) : null}
              {experiment.estimated_hours != null || experiment.estimated_cost ? (
                <Row term="시간·비용 추정">
                  <p className="text-[15px] leading-[1.7] text-ink-secondary">
                    {experiment.estimated_hours != null ? `약 ${experiment.estimated_hours}시간` : "시간 미상"}
                    {experiment.estimated_cost?.amount != null
                      ? ` · ${experiment.estimated_cost.amount}${experiment.estimated_cost.currency ?? ""}`
                      : ""}
                  </p>
                </Row>
              ) : null}
              {experiment.feasibility_status ? (
                <Row term="실행 가능성">
                  <div className="space-y-1.5">
                    <Badge tone={experiment.feasibility_status === "fits" ? "positive" : "critical"}>
                      {FEASIBILITY_STATUS_LABEL_V2[experiment.feasibility_status] ?? experiment.feasibility_status}
                    </Badge>
                    {experiment.unresolved_constraints?.length ? (
                      <ul className="space-y-1 pt-1">
                        {experiment.unresolved_constraints.map((item, index) => (
                          <li key={`${index}-${item}`} className="text-[13px] leading-relaxed text-ink-secondary">
                            · {item}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </Row>
              ) : null}
              {experiment.limitations?.length ? (
                <Row term="한계">
                  <ul className="space-y-1.5">
                    {experiment.limitations.map((item, index) => (
                      <li key={`${index}-${item}`} className="text-[13px] leading-relaxed text-ink-secondary">
                        · {item}
                      </li>
                    ))}
                  </ul>
                </Row>
              ) : null}
            </dl>
          </div>
        </Section>
      ) : null}

      <Section number="03" title="Recommended Resources" icon={Boxes} lead>
        {trace.resource?.strategy ? (
          <div className="mb-4 rounded-xl border border-line bg-surface-muted px-6 py-5">
            <h3 className="text-[13px] font-medium text-ink-muted">필요 전략</h3>
            <p className="mt-1.5 text-[15px] leading-[1.7] text-ink">{trace.resource.strategy}</p>
          </div>
        ) : null}
        {resourceStatus ? (
          <div className="mb-4">
            <Badge tone={resourceStatus === "available" ? "positive" : "muted"}>
              {RESOURCE_STATUS_LABEL_V2[resourceStatus] ?? resourceStatus}
            </Badge>
          </div>
        ) : null}
        <ResourceRecommendations
          resources={resources}
          reasons={pickReasons}
          emptyMessage={resourceEmptyMessage}
        />
      </Section>

      <Section number="04" title="근거 상태 (Readiness)">
        <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
          {(report?.readiness ?? []).map((item) => (
            <div key={item.dimension} className="space-y-2 bg-surface p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-semibold text-ink">
                  {READINESS_DIMENSION_LABEL_V2[item.dimension as keyof typeof READINESS_DIMENSION_LABEL_V2] ??
                    item.dimension}
                </h3>
                <Badge tone={item.status === "supported" ? "positive" : item.status === "not_supported" ? "critical" : "muted"}>
                  {READINESS_STATUS_LABEL_V2[item.status] ?? item.status}
                </Badge>
              </div>
              {item.scope ? (
                <p className="text-[13px] leading-relaxed text-ink-secondary">{item.scope}</p>
              ) : item.missing_information?.length ? (
                <ul className="space-y-1">
                  {item.missing_information.map((info, index) => (
                    <li key={`${index}-${info}`} className="text-[13px] leading-relaxed text-ink-secondary">
                      · {info}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-muted">
          v2는 0~100 확신 점수 대신 영역별 확인 범위를 보여줍니다. 현재 잠정 단계:{" "}
          {stageLabelOrHold(report?.current_stage)}
        </p>
      </Section>

      <Section number="05" title="Evidence">
        <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          <EvidenceList
            title="확보된 사실"
            description="이 판단을 뒷받침한 근거"
            items={result.supporting_evidence}
            emptyText="이 판단을 직접 뒷받침하는 근거가 아직 없습니다."
            marker={Check}
            markerClass="text-positive"
          />
          <EvidenceList
            title="미검증 가설"
            description="사실처럼 말했지만 아직 확인되지 않은 것"
            items={(trace.evidence?.unverified_hypotheses ?? []).map((item) => item.statement)}
            emptyText="사실로 가정된 진술이 지목되지 않았습니다."
            marker={CircleHelp}
            markerClass="text-ink-muted"
          />
          <EvidenceList
            title="누락된 근거"
            description="판단하려면 아직 필요한 것"
            items={result.missing_evidence}
            emptyText="추가로 필요한 근거가 지목되지 않았습니다."
            marker={Minus}
            markerClass="text-critical"
          />
        </div>
      </Section>

      <Section number="06" title="AI C-Level Board" icon={Users} lead>
        <p className="mb-4 text-[13px] leading-relaxed text-ink-secondary">
          아래 결론은 한 모델의 단일 판단이 아니라, 역할이 분리된 여러 에이전트가 차례로
          분석하고 반박한 결과입니다.
        </p>
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          <BoardRow role="Evidence Agent" duty="사실 · 가설 · 누락 구분" body={trace.evidence?.summary}>
            {trace.evidence ? (
              <p className="text-[13px] text-ink-muted">
                사실 {trace.evidence.available_evidence?.length ?? 0}건 · 미검증 가설{" "}
                {trace.evidence.unverified_hypotheses?.length ?? 0}건 · 누락{" "}
                {trace.evidence.missing_evidence?.length ?? 0}건
              </p>
            ) : null}
          </BoardRow>

          <BoardRow
            role="Bottleneck Analyst"
            duty="근거 상태 · 우선 과제 분석"
            body={trace.bottleneck?.lean_analyst_opinion ?? result.lean_analyst_opinion}
          >
            {trace.bottleneck?.candidates?.length ? (
              <div className="space-y-1.5">
                <p className="text-[13px] font-medium text-ink">검토한 과제 후보</p>
                <ul className="space-y-1">
                  {trace.bottleneck.candidates.map((candidate, index) => (
                    <li key={`${index}-${candidate.statement}`} className="text-[13px] leading-relaxed text-ink-muted">
                      · {candidate.statement}
                      {candidate.diagnosis_status
                        ? ` (${DIAGNOSIS_STATUS_LABEL_V2[candidate.diagnosis_status] ?? candidate.diagnosis_status})`
                        : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </BoardRow>

          <BoardRow
            role="Red Team Agent"
            duty="근거 검토 · 대안 제시"
            badge={trace.red_team?.verdict ? RED_TEAM_VERDICT_LABEL_V2[trace.red_team.verdict] ?? trace.red_team.verdict : undefined}
            body={trace.red_team?.counterargument ?? result.red_team_counterargument}
          >
            {trace.red_team?.alternative_candidate ? (
              <p className="text-[13px] leading-relaxed text-ink-muted">
                대안: {trace.red_team.alternative_candidate.statement}
              </p>
            ) : null}
            {report?.review_resolution?.length ? (
              <div className="space-y-1.5">
                <p className="text-[13px] font-medium text-ink">반박 처리 결과</p>
                <ul className="space-y-1">
                  {report.review_resolution.map((item, index) => (
                    <li key={`${index}-${item.item}`} className="text-[13px] leading-relaxed text-ink-muted">
                      · {item.item} — {item.resolution}
                      {item.reason ? ` (${item.reason})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </BoardRow>

          <BoardRow role="Resource Agent" duty="확정된 행동 실행 자원 검색" body={trace.resource?.strategy}>
            {trace.resource?.candidate_count !== undefined ? (
              <p className="text-[13px] text-ink-muted">
                후보 {trace.resource.candidate_count}건 중 {resources.length}건 선택
                {trace.resource.retrieval_mode ? ` (검색 범위: ${trace.resource.retrieval_mode})` : ""}
              </p>
            ) : null}
          </BoardRow>

          <BoardRow role="Strategy Synthesizer" duty="충돌 조정 · 최종 결정" body={result.bottleneck_reason}>
            <p className="text-[13px] leading-relaxed text-ink-muted">최종 판단: {result.critical_bottleneck}</p>
            {experiment ? (
              <p className="text-[13px] leading-relaxed text-ink-muted">다음 행동: {experiment.title}</p>
            ) : null}
          </BoardRow>
        </div>
      </Section>

      {answers.length > 0 ? (
        <Section number="07" title="진단 대화 기록">
          <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {answers.map((row) => (
              <li key={row.id} className="space-y-2 px-6 py-5">
                <p className="text-[13px] font-medium text-ink">
                  <span className="mr-2 tabular-nums text-ink-muted">Q{row.order_index}</span>
                  {row.question}
                </p>
                <p className="text-[13px] leading-relaxed text-ink-secondary">{row.answer ?? "답변 없음"}</p>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      <Section number="08" title="다음 라운드로 이어가기" icon={RefreshCw} lead>
        <VerificationFormV2 sessionId={sessionId} experiment={report?.next_experiment} />
      </Section>

      <div className="flex flex-wrap gap-3 border-t border-line pt-8">
        <Button asChild variant="secondary">
          <Link href={`/projects/${projectId}`}>프로젝트로 돌아가기</Link>
        </Button>
      </div>
    </article>
  );
}

function OutcomeRule({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className="text-[13px] leading-relaxed text-ink-secondary">{value}</dd>
    </div>
  );
}
