import {
  ArrowLeft,
  BookOpen,
  Boxes,
  Check,
  CircleHelp,
  ExternalLink,
  FlaskConical,
  Minus,
  OctagonX,
  RefreshCw,
  Ruler,
  Target,
  Users,
  UserRound,
  Wrench,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfidenceMeter } from "@/components/app/confidence";
import { StageRail } from "@/components/app/stage-rail";
import { requireUser } from "@/lib/auth";
import { getSession, getResult, listAnswers, listResources } from "@/lib/data/diagnosis";
import { getProject } from "@/lib/data/projects";
import { parseAgentTrace, RED_TEAM_VERDICT_LABEL } from "@/lib/ai/trace";
import {
  EXPERIMENT_DURATION_LABEL,
  groupResources,
  GROWTH_STAGE_LABEL,
  RESOURCE_TYPE_LABEL,
} from "@/lib/domain/constants";
import { formatDate } from "@/lib/utils";
import { VerificationForm } from "./verification-form";
import type { ComponentType, ReactNode } from "react";
import type { GrowthStage, ResourceRow } from "@/lib/types/database";

export const metadata: Metadata = { title: "진단 리포트" };

export default async function ResultPage({
  params,
}: {
  params: Promise<{ projectId: string; sessionId: string }>;
}) {
  const { projectId, sessionId } = await params;
  const user = await requireUser();

  const session = await getSession(sessionId, user.id);
  if (session.project_id !== projectId) notFound();

  const [project, result, answers] = await Promise.all([
    getProject(projectId, user.id),
    getResult(sessionId, user.id),
    listAnswers(sessionId, user.id),
  ]);

  if (!result) notFound();

  const resources = await listResources(result.recommended_resource_ids);
  const experiment = result.next_experiment;
  const trace = parseAgentTrace(result.agent_trace);

  // Older reports predate the synthesizer's evidence_gap field; the analyst's
  // gap for the same bottleneck is the closest thing they stored.
  const evidenceGap =
    trace.synthesis?.evidence_gap || trace.bottleneck?.critical_bottleneck?.evidence_gap;

  const pickReasons = new Map(
    (trace.resource?.picks ?? []).map((pick) => [pick.resource_id, pick.reason]),
  );

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
              Diagnosis report
            </p>
            <h1 className="text-display font-semibold">{project.name}</h1>
          </div>
          <p className="text-[13px] tabular-nums text-ink-muted">
            {formatDate(result.created_at)} · 질문 {answers.length}개
          </p>
        </div>
      </header>

      {/* 가장 중요한 시각 요소 1 — Critical Bottleneck */}
      <Section number="01" title="Critical Bottleneck" icon={Target} lead>
        <div className="rounded-xl border border-critical-line bg-critical-soft p-7 sm:p-9">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-critical">
            지금 이 사업을 막고 있는 것
          </p>
          <h2 className="mt-4 text-[22px] font-semibold leading-snug tracking-tight text-ink sm:text-[27px]">
            {result.critical_bottleneck}
          </h2>
          {evidenceGap ? (
            <div className="mt-6 border-t border-critical-line pt-5">
              <h3 className="text-[13px] font-medium text-ink">Evidence Gap</h3>
              <p className="mt-2 text-[15px] leading-[1.75] text-ink-secondary">
                {evidenceGap}
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

      {/* 가장 중요한 시각 요소 2 — Next Experiment */}
      <Section number="02" title="Next Experiment" icon={FlaskConical} lead>
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-7 py-6">
            <h2 className="text-[19px] font-semibold leading-snug tracking-tight">
              {experiment.title}
            </h2>
            <Badge tone="accent">{experiment.duration ?? EXPERIMENT_DURATION_LABEL}</Badge>
          </div>

          <dl className="divide-y divide-line">
            <Row term="Hypothesis">
              <p className="text-[15px] leading-[1.75] text-ink">{experiment.hypothesis}</p>
            </Row>
            <Row term="Method">
              <ol className="space-y-2.5">
                {experiment.method.map((item, index) => (
                  <li key={`${index}-${item}`} className="flex gap-3 text-[15px] leading-[1.7] text-ink-secondary">
                    <span className="shrink-0 tabular-nums text-ink-muted">
                      {index + 1}.
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </Row>
            {experiment.verification_method ? (
              <Row term="검증 방법">
                <p className="flex gap-3 text-[15px] leading-[1.7] text-ink-secondary">
                  <Ruler aria-hidden className="mt-1 size-4 shrink-0 text-ink-muted" />
                  <span>{experiment.verification_method}</span>
                </p>
              </Row>
            ) : null}
            <Row term="성공 기준">
              <ul className="space-y-2.5">
                {experiment.success_criteria.map((item, index) => (
                  <li key={`${index}-${item}`} className="flex gap-3 text-[15px] leading-[1.7] text-ink-secondary">
                    <Check
                      aria-hidden
                      className="mt-1 size-4 shrink-0 text-positive"
                      strokeWidth={2.5}
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Row>
            {experiment.stop_condition ? (
              <Row term="중단 조건">
                <p className="flex gap-3 text-[15px] leading-[1.7] text-ink-secondary">
                  <OctagonX aria-hidden className="mt-1 size-4 shrink-0 text-critical" />
                  <span>{experiment.stop_condition}</span>
                </p>
              </Row>
            ) : null}
          </dl>
        </div>
      </Section>

      <Section number="03" title="Recommended Resources" icon={Boxes} lead>
        {trace.resource?.strategy ? (
          <div className="mb-4 rounded-xl border border-line bg-surface-muted px-6 py-5">
            <h3 className="text-[13px] font-medium text-ink-muted">필요 전략</h3>
            <p className="mt-1.5 text-[15px] leading-[1.7] text-ink">
              {trace.resource.strategy}
            </p>
          </div>
        ) : null}
        <p className="mb-4 text-[13px] leading-relaxed text-ink-secondary">
          위 실험을 실제로 실행하는 데 필요한 것만 골랐습니다.
        </p>
        <ResourceRecommendations resources={resources} reasons={pickReasons} />
      </Section>

      <Section number="04" title="현재 단계">
        <div className="space-y-6">
          <StageRail current={result.current_stage} />
          <div className="grid gap-8 rounded-xl border border-line bg-surface p-6 sm:grid-cols-2">
            <ConfidenceMeter
              label="Stage Confidence"
              value={result.stage_confidence}
              caption="이 단계 판정을 얼마나 확신하는지"
            />
            <ConfidenceMeter
              label="Evidence Confidence"
              value={result.evidence_confidence}
              caption="현재 근거만으로 판단할 수 있는 정도. 낮다면 사업이 나쁜 것이 아니라 아직 확인된 것이 적다는 뜻입니다."
            />
          </div>
        </div>
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

      {/* 역할이 분리된 다섯 에이전트의 산출을 하나의 검토 화면으로 보여준다. */}
      <Section number="06" title="AI C-Level Board" icon={Users} lead>
        <p className="mb-4 text-[13px] leading-relaxed text-ink-secondary">
          아래 결론은 한 모델의 단일 판단이 아니라, 역할이 분리된 다섯 에이전트가 차례로
          분석하고 반박한 결과입니다.
        </p>
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          <BoardRow
            role="Evidence Agent"
            duty="사실 · 가설 · 누락 구분"
            body={trace.evidence?.summary}
          >
            {trace.evidence ? (
              <p className="text-[13px] text-ink-muted">
                사실 {trace.evidence.available_evidence?.length ?? 0}건 · 미검증 가설{" "}
                {trace.evidence.unverified_hypotheses?.length ?? 0}건 · 누락{" "}
                {trace.evidence.missing_evidence?.length ?? 0}건
              </p>
            ) : null}
          </BoardRow>

          <BoardRow
            role="Lean Analyst"
            duty="성장 단계 · 병목 분석"
            body={trace.bottleneck?.lean_analyst_opinion ?? result.lean_analyst_opinion}
          >
            {trace.stage?.reasoning ? (
              <p className="text-[13px] leading-relaxed text-ink-muted">
                단계 판정: {stageLabel(trace.stage.current_stage)} — {trace.stage.reasoning}
              </p>
            ) : null}
            {trace.bottleneck?.candidates?.length ? (
              <div className="space-y-1.5">
                <p className="text-[13px] font-medium text-ink">검토한 병목 후보</p>
                <ul className="space-y-1">
                  {trace.bottleneck.candidates.map((candidate, index) => (
                    <li
                      key={`${index}-${candidate.statement}`}
                      className="text-[13px] leading-relaxed text-ink-muted"
                    >
                      · {candidate.statement}
                      {candidate.evidence_gap ? ` (Gap: ${candidate.evidence_gap})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </BoardRow>

          <BoardRow
            role="Red Team Agent"
            duty="분석 반박 · 과잉 확신 제거"
            badge={
              trace.red_team?.verdict
                ? RED_TEAM_VERDICT_LABEL[trace.red_team.verdict]
                : undefined
            }
            body={trace.red_team?.counterargument ?? result.red_team_counterargument}
          >
            {trace.red_team?.challenged_assumptions?.length ? (
              <div className="space-y-1.5">
                <p className="text-[13px] font-medium text-ink">의심한 가정</p>
                <ul className="space-y-1">
                  {trace.red_team.challenged_assumptions.map((item, index) => (
                    <li key={`${index}-${item}`} className="text-[13px] leading-relaxed text-ink-muted">
                      · {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {trace.red_team?.alternative_bottleneck ? (
              <p className="text-[13px] leading-relaxed text-ink-muted">
                대안 가설: {trace.red_team.alternative_bottleneck}
              </p>
            ) : null}
          </BoardRow>

          <BoardRow
            role="Resource Agent"
            duty="확정된 병목 해결 자원 검색"
            body={trace.resource?.strategy}
          >
            {trace.resource?.candidate_count !== undefined ? (
              <p className="text-[13px] text-ink-muted">
                병목 태그로 좁힌 후보 {trace.resource.candidate_count}건 중{" "}
                {resources.length}건 선택
              </p>
            ) : null}
          </BoardRow>

          <BoardRow
            role="Strategy Synthesizer"
            duty="충돌 조정 · 최종 결정"
            body={result.bottleneck_reason}
          >
            <p className="text-[13px] leading-relaxed text-ink-muted">
              최종 병목: {result.critical_bottleneck}
            </p>
            <p className="text-[13px] leading-relaxed text-ink-muted">
              {EXPERIMENT_DURATION_LABEL} 미션: {experiment.title}
            </p>
          </BoardRow>
        </div>
      </Section>

      {answers.length > 0 ? (
        <Section number="07" title="진단 대화 기록">
          <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {answers.map((row) => (
              <li key={row.id} className="space-y-2 px-6 py-5">
                <p className="text-[13px] font-medium text-ink">
                  <span className="mr-2 tabular-nums text-ink-muted">
                    Q{row.order_index}
                  </span>
                  {row.question}
                </p>
                <p className="text-[13px] leading-relaxed text-ink-secondary">
                  {row.answer ?? "답변 없음"}
                </p>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      <Section number="08" title="다음 라운드로 이어가기" icon={RefreshCw} lead>
        <VerificationForm sessionId={sessionId} />
      </Section>

      <div className="flex flex-wrap gap-3 border-t border-line pt-8">
        <Button asChild variant="secondary">
          <Link href={`/projects/${projectId}`}>프로젝트로 돌아가기</Link>
        </Button>
      </div>
    </article>
  );
}

function stageLabel(stage: string | undefined): string {
  if (!stage) return "-";
  return GROWTH_STAGE_LABEL[stage as GrowthStage] ?? stage;
}

function Section({
  number,
  title,
  icon: Icon,
  lead,
  children,
}: {
  number: string;
  title: string;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  lead?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-[11px] tabular-nums text-ink-muted">{number}</span>
        {Icon ? <Icon aria-hidden className="size-4 text-ink" /> : null}
        <h2
          className={
            lead
              ? "text-[13px] font-semibold uppercase tracking-[0.14em] text-ink"
              : "text-[13px] font-medium uppercase tracking-[0.14em] text-ink-secondary"
          }
        >
          {title}
        </h2>
        <span aria-hidden className="h-px flex-1 bg-line" />
      </div>
      {children}
    </section>
  );
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 px-7 py-6 sm:grid-cols-[132px_1fr] sm:gap-6">
      <dt className="text-[13px] font-medium text-ink-muted">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function BoardRow({
  role,
  duty,
  badge,
  body,
  children,
}: {
  role: string;
  duty: string;
  badge?: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-3 px-6 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-semibold text-ink">{role}</h3>
        <span className="text-xs text-ink-muted">{duty}</span>
        {badge ? <Badge>{badge}</Badge> : null}
      </div>
      {body ? (
        <p className="whitespace-pre-line text-[14px] leading-[1.75] text-ink-secondary">
          {body}
        </p>
      ) : (
        <p className="text-[13px] text-ink-muted">이 라운드에 기록된 산출이 없습니다.</p>
      )}
      {children}
    </div>
  );
}

function EvidenceList({
  title,
  description,
  items,
  emptyText,
  marker: Marker,
  markerClass,
}: {
  title: string;
  description: string;
  items: string[];
  emptyText: string;
  marker: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  markerClass: string;
}) {
  return (
    <div className="space-y-4 bg-surface p-6">
      <div className="space-y-1">
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        <p className="text-xs text-ink-muted">{description}</p>
      </div>
      {items.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-ink-secondary">{emptyText}</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item, index) => (
            <li key={`${index}-${item}`} className="flex gap-2.5 text-[14px] leading-[1.7] text-ink-secondary">
              <Marker aria-hidden className={`mt-1 size-4 shrink-0 ${markerClass}`} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const GROUP_ICON: Record<
  string,
  ComponentType<{ className?: string; "aria-hidden"?: boolean }>
> = {
  expert: UserRound,
  tool: Wrench,
  knowledge: BookOpen,
};

function ResourceRecommendations({
  resources,
  reasons,
}: {
  resources: ResourceRow[];
  reasons: Map<string, string>;
}) {
  const groups = groupResources(resources);

  if (groups.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong bg-surface-muted px-6 py-8 text-[13px] text-ink-secondary">
        이번 실험은 외부 도움 없이 창업자 혼자 실행할 수 있다고 판단했습니다.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const Icon = GROUP_ICON[group.key] ?? BookOpen;
        return (
          <div
            key={group.key}
            className="overflow-hidden rounded-xl border border-line bg-surface"
          >
            <div className="flex items-center gap-2.5 border-b border-line px-6 py-4">
              <Icon aria-hidden className="size-4 text-ink" />
              <h3 className="text-[13px] font-semibold text-ink">{group.label}</h3>
              <span className="text-xs text-ink-muted">{group.description}</span>
            </div>
            <ul className="divide-y divide-line">
              {group.items.map((resource) => {
                const reason = reasons.get(resource.id);
                return (
                  <li key={resource.id} className="space-y-1.5 px-6 py-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-[15px] font-semibold text-ink">
                        {resource.url ? (
                          <a
                            href={resource.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="inline-flex items-center gap-1.5 underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                          >
                            {resource.title}
                            <ExternalLink aria-hidden className="size-3.5 text-ink-muted" />
                          </a>
                        ) : (
                          resource.title
                        )}
                      </h4>
                      <Badge>{RESOURCE_TYPE_LABEL[resource.resource_type]}</Badge>
                    </div>
                    <p className="text-[13px] leading-relaxed text-ink-secondary">
                      {resource.description}
                    </p>
                    {reason ? (
                      <p className="border-l-2 border-line pl-3 text-[13px] leading-relaxed text-ink">
                        왜 필요한가 — {reason}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
