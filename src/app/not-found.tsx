import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <FileQuestion aria-hidden className="size-6 text-ink-muted" />
      <p className="text-[13px] font-medium uppercase tracking-[0.16em] text-ink-muted">
        404
      </p>
      <h1 className="text-xl font-semibold tracking-tight">
        찾을 수 없는 페이지입니다
      </h1>
      <p className="text-sm leading-relaxed text-ink-secondary">
        주소가 바뀌었거나, 접근 권한이 없는 리소스일 수 있습니다.
      </p>
      <Button asChild>
        <Link href="/dashboard">대시보드로</Link>
      </Button>
    </div>
  );
}
