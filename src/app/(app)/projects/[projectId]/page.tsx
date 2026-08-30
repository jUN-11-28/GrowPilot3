import { ArrowLeft, ArrowRight, ChevronRight, Play } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { DeleteProjectButton } from "./delete-project-button";
import { AttachmentsPanel } from "./attachments-panel";
import { requireUser } from "@/lib/auth";
import { findProject, getProject } from "@/lib/data/projects";
import { listResultsByProject, listSessions } from "@/lib/data/diagnosis";
import { listAttachments } from "@/lib/data/attachments";
import { startDiagnosis } from "@/lib/actions/diagnosis";
import { EVIDENCE_LABEL, PROJECT_STAGE_LABEL } from "@/lib/domain/constants";
import { formatDate } from "@/lib/utils";
import type { SessionStatus } from "@/lib/types/database";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<Metadata> {
  const { projectId } = await params;
  const user = await requireUser();
  // Must not 404 from metadata — that would commit the response before the
  // page renders and the status code would be lost.
  const project = await findProject(projectId, user.id);
  return { title: project?.name ?? "프로젝트" };
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  questioning: "질문 진행 중",
  analyzing: "분석 중",
  completed: "완료",
  failed: "실패",
};

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await requireUser();

  const project = await getProject(projectId, user.id);
  const [sessions, results, attachments] = await Promise.all([
    listSessions(projectId, user.id),
    listResultsByProject(projectId, user.id),
    listAttachments(projectId, user.id),
  ]);

  const latest = results[0];
  const resultBySession = new Map(results.map((row) => [row.session_id, row]));

  return (
    <div className="space-y-10">
      <header className="space-y-5">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          프로젝트
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
              <Badge>{PROJECT_STAGE_LABEL[project.stage]}</Badge>
              <span>생성 {formatDate(project.created_at)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DeleteProjectButton projectId={project.id} />
            <form action={startDiagnosis}>
              <input type="hidden" name="projectId" value={project.id} />
              <Button type="submit">
                <Play aria-hidden className="size-3.5" />
                진단 시작
              </Button>
            </form>
          </div>
        </div>
      </header>

      {latest ? (
        <Link
          href={`/projects/${projectId}/diagnosis/${latest.session_id}/result`}
          className="block rounded-xl border border-critical-line bg-critical-soft p-6 transition-colors hover:border-critical/40"
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-critical">
            최근 진단 · Critical Bottleneck
          </p>
          <p className="mt-3 text-[17px] font-semibold leading-snug tracking-tight text-ink">
            {latest.critical_bottleneck}
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-ink-secondary">
            {formatDate(latest.created_at)} · 리포트 보기
            <ArrowRight aria-hidden className="size-3.5" />
          </p>
        </Link>
      ) : null}

      <Card>
        <CardHeader title="프로젝트 정보" description="진단은 이 정보에서 시작합니다." />
        <CardBody className="space-y-6">
          <Detail term="해결하려는 문제">{project.problem}</Detail>
          <Detail term="타깃 고객">{project.target_customer}</Detail>
          <Detail term="해결 방법">{project.solution}</Detail>
          <Detail term="확보한 Evidence">
            {project.evidence.length === 0 ? (
              <span className="text-ink-muted">선택하지 않음</span>
            ) : (
              <span className="flex flex-wrap gap-1.5">
                {project.evidence.map((item) => (
                  <Badge key={item}>{EVIDENCE_LABEL[item]}</Badge>
                ))}
              </span>
            )}
          </Detail>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="첨부 자료"
          description="사업기획서, 재무제표, 고민되는 점을 파일이나 사진으로 올려두면 다음 진단에서 근거로 반영됩니다."
        />
        <CardBody>
          <AttachmentsPanel projectId={project.id} attachments={attachments} />
        </CardBody>
      </Card>

      <section className="space-y-4">
        <h2 className="text-[15px] font-semibold">진단 기록</h2>
        {sessions.length === 0 ? (
          <EmptyState
            title="아직 진단하지 않았습니다"
            description="AI가 현재 단계와 확보한 근거를 읽고 최대 8개의 질문을 던진 뒤, 병목과 다음 실험을 담은 리포트를 만듭니다."
            action={
              <form action={startDiagnosis}>
                <input type="hidden" name="projectId" value={project.id} />
                <Button type="submit">
                  <Play aria-hidden className="size-3.5" />
                  첫 진단 시작
                </Button>
              </form>
            }
          />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {sessions.map((session) => {
              const result = resultBySession.get(session.id);
              const href = result
                ? `/projects/${projectId}/diagnosis/${session.id}/result`
                : `/projects/${projectId}/diagnosis/${session.id}`;
              return (
                <li key={session.id}>
                  <Link
                    href={href}
                    className="flex items-center justify-between gap-5 px-6 py-4 transition-colors hover:bg-surface-muted"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm text-ink">
                        {result ? (
                          result.critical_bottleneck
                        ) : (
                          <span className="text-ink-secondary">
                            {STATUS_LABEL[session.status]}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {formatDate(session.created_at)}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-2">
                    <Badge
                      tone={
                        session.status === "completed"
                          ? "positive"
                          : session.status === "failed"
                            ? "critical"
                            : "neutral"
                      }
                    >
                      {STATUS_LABEL[session.status]}
                    </Badge>
                    <ChevronRight aria-hidden className="size-4 text-ink-muted" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Detail({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[168px_1fr] sm:gap-6">
      <dt className="text-[13px] font-medium text-ink-muted">{term}</dt>
      <dd className="whitespace-pre-line text-sm leading-relaxed text-ink">{children}</dd>
    </div>
  );
}
