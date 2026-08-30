import {
  ArrowLeft,
  BookOpen,
  Boxes,
  Check,
  ExternalLink,
  FlaskConical,
  Minus,
  RefreshCw,
  Target,
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
import { groupResources, RESOURCE_TYPE_LABEL } from "@/lib/domain/constants";
import { formatDate } from "@/lib/utils";
import { VerificationForm } from "./verification-form";
import type { ComponentType, ReactNode } from "react";
import type { ResourceRow } from "@/lib/types/database";

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
            <Badge tone="accent">{experiment.duration}</Badge>
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
            <Row term="Success criteria">
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
          </dl>
        </div>
      </Section>

      <Section number="03" title="Recommended Resources" icon={Boxes} lead>
        <p className="mb-4 text-[13px] leading-relaxed text-ink-secondary">
          위 실험을 실제로 실행하는 데 필요한 것만 골랐습니다.
        </p>
        <ResourceRecommendations resources={resources} />
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
        <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
          <EvidenceList
            title="Supporting Evidence"
            description="이 판단을 뒷받침한 근거"
            items={result.supporting_evidence}
            emptyText="이 판단을 직접 뒷받침하는 근거가 아직 없습니다."
            marker={Check}
            markerClass="text-positive"
          />
          <EvidenceList
            title="Missing Evidence"
            description="판단하려면 아직 필요한 것"
            items={result.missing_evidence}
            emptyText="추가로 필요한 근거가 지목되지 않았습니다."
            marker={Minus}
            markerClass="text-critical"
          />
        </div>
      </Section>

      <Section number="06" title="분석가 의견">
        <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-2">
          <div className="space-y-3 bg-surface p-6">
            <h3 className="text-[13px] font-semibold text-ink">Lean Analyst Opinion</h3>
            <p className="whitespace-pre-line text-[15px] leading-[1.75] text-ink-secondary">
              {result.lean_analyst_opinion}
            </p>
          </div>
          <div className="space-y-3 bg-surface p-6">
            <h3 className="text-[13px] font-semibold text-ink">Red Team Counterargument</h3>
            <p className="whitespace-pre-line text-[15px] leading-[1.75] text-ink-secondary">
              {result.red_team_counterargument}
            </p>
          </div>
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

function ResourceRecommendations({ resources }: { resources: ResourceRow[] }) {
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
              {group.items.map((resource) => (
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
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
