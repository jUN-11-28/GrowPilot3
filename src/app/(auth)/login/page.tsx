import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "로그인" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>;
}) {
  const { redirectTo, error } = await searchParams;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">로그인</h1>
        <p className="text-sm text-ink-secondary">
          진단을 이어가려면 계정에 로그인하세요.
        </p>
      </div>

      <LoginForm
        redirectTo={redirectTo}
        initialError={
          error === "auth_callback_failed"
            ? "인증 링크가 만료되었거나 이미 사용되었습니다. 다시 로그인해 주세요."
            : undefined
        }
      />

      <p className="text-[13px] text-ink-secondary">
        계정이 없으신가요?{" "}
        <Link href="/signup" className="font-medium text-ink underline underline-offset-4">
          회원가입
        </Link>
      </p>
    </div>
  );
}
