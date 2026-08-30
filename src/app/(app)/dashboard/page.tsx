import { ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { requireUser } from "@/lib/auth";
import { listProjects } from "@/lib/data/projects";
import { PROJECT_STAGE_LABEL } from "@/lib/domain/constants";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "프로젝트" };

export default async function DashboardPage() {
  const user = await requireUser();
  const projects = await listProjects(user.id);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">프로젝트</h1>
          <p className="text-sm text-ink-secondary">
            진단할 창업 프로젝트를 선택하거나 새로 만드세요.
          </p>
        </div>
        <Button asChild>
          <Link href="/projects/new">
            <Plus aria-hidden className="size-4" />
            새 프로젝트
          </Link>
        </Button>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="아직 프로젝트가 없습니다"
          description="프로젝트를 만들면 현재 단계와 확보한 근거를 바탕으로 AI 진단을 시작할 수 있습니다."
          action={
            <Button asChild>
              <Link href="/projects/new">첫 프로젝트 만들기</Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="flex items-center justify-between gap-6 px-6 py-5 transition-colors hover:bg-surface-muted"
              >
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <h2 className="truncate text-[15px] font-semibold">{project.name}</h2>
                    <Badge>{PROJECT_STAGE_LABEL[project.stage]}</Badge>
                  </div>
                  <p className="line-clamp-1 text-[13px] text-ink-secondary">
                    {project.problem}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-2 text-[13px] tabular-nums text-ink-muted">
                  <span className="hidden sm:block">
                    {formatDate(project.created_at)}
                  </span>
                  <ChevronRight aria-hidden className="size-4" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
