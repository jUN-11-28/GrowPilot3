import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "회원가입" };

export default function SignupPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">회원가입</h1>
        <p className="text-sm text-ink-secondary">
          프로젝트를 등록하고 첫 진단을 시작하세요.
        </p>
      </div>

      <SignupForm />

      <p className="text-[13px] text-ink-secondary">
        이미 계정이 있으신가요?{" "}
        <Link href="/login" className="font-medium text-ink underline underline-offset-4">
          로그인
        </Link>
      </p>
    </div>
  );
}
