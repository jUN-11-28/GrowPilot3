import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/app/logo";
import { getOptionalUser } from "@/lib/auth";
import { GROWTH_STAGES } from "@/lib/domain/constants";

export default async function LandingPage() {
  const user = await getOptionalUser();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Logo />
          <nav className="flex items-center gap-2">
            {user ? (
              <Button asChild size="sm">
                <Link href="/dashboard">대시보드</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">로그인</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/signup">시작하기</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6">
        <section className="max-w-2xl py-24 sm:py-32">
          <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            Adaptive startup diagnosis
          </p>
          <h1 className="mt-5 text-display font-semibold">
            지금 당신의 사업을 막고 있는
            <br />
            단 하나의 병목을 찾습니다.
          </h1>
          <p className="mt-6 text-[15px] leading-relaxed text-ink-secondary">
            설문지가 아닙니다. AI가 프로젝트의 단계와 이미 확보한 근거를 읽고, 판단에
            필요한 질문만 하나씩 물어봅니다. 최대 8개의 질문 뒤에 다음 단계로 가기 위한
            병목과 다음 실험을 담은 리포트를 받습니다.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href={user ? "/dashboard" : "/signup"}>
                {user ? "대시보드로 이동" : "무료로 진단 시작"}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </Button>
            <span className="text-[13px] text-ink-muted">
              데이터가 없어도 진단할 수 있습니다.
            </span>
          </div>
        </section>

        <section className="border-t border-line py-16">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            Growth stage model
          </h2>
          <ol className="mt-8 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
            {GROWTH_STAGES.map((stage, index) => (
              <li key={stage.value} className="bg-surface px-5 py-6">
                <span className="text-xs tabular-nums text-ink-muted">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-3 text-sm font-semibold">{stage.label}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">
                  {stage.description}
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-6 max-w-2xl text-[13px] leading-relaxed text-ink-secondary">
            점수가 가장 낮은 항목을 병목이라고 부르지 않습니다. 선행 단계의 근거가
            부족하면 그 단계가 먼저 병목 후보가 됩니다.
          </p>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-[13px] text-ink-muted">
          <span>GrowPilot</span>
          <span>MVP</span>
        </div>
      </footer>
    </div>
  );
}
