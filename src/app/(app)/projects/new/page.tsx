import type { Metadata } from "next";
import Link from "next/link";
import { ProjectForm } from "./project-form";

export const metadata: Metadata = { title: "새 프로젝트" };

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-2">
        <Link
          href="/dashboard"
          className="text-[13px] text-ink-muted transition-colors hover:text-ink"
        >
          ← 프로젝트
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">새 프로젝트</h1>
        <p className="text-sm leading-relaxed text-ink-secondary">
          여기 적은 내용은 진단의 출발점입니다. AI는 이미 알고 있는 내용을 다시 묻지
          않습니다.
        </p>
      </div>

      <ProjectForm />
    </div>
  );
}
