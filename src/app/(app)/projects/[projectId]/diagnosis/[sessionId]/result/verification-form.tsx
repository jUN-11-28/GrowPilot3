"use client";

import { RefreshCw } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Alert, Spinner } from "@/components/ui/feedback";
import {
  submitVerification,
  type VerificationFormState,
} from "@/lib/actions/diagnosis";

export function VerificationForm({ sessionId }: { sessionId: string }) {
  const [state, action, pending] = useActionState<VerificationFormState, FormData>(
    submitVerification,
    {},
  );

  return (
    <form action={action} className="space-y-5 rounded-xl border border-line bg-surface p-6 sm:p-7">
      <input type="hidden" name="sessionId" value={sessionId} />
      <div className="space-y-1.5">
        <h2 className="text-[15px] font-semibold text-ink">실험을 실행했다면, 결과를 남겨 주세요</h2>
        <p className="text-[13px] leading-relaxed text-ink-secondary">
          검증 결과를 입력하면 다음 진단의 근거로 반영되고, 새 진단 세션이 바로 시작됩니다.
        </p>
      </div>

      {state.error ? <Alert>{state.error}</Alert> : null}

      <Field
        label="실험 결과가 어떻게 됐나요?"
        htmlFor="verification"
        required
        hint="성공 기준 대비 실제로 무엇을 확인했는지 적어 주세요"
      >
        <Textarea
          id="verification"
          name="verification"
          required
          rows={4}
          placeholder="예: 8명 중 6명이 최근 1개월 내 이 문제를 겪었다고 답했다."
        />
      </Field>

      <Field
        label="새로 생긴 고민이나 상황 (선택)"
        htmlFor="newConcern"
        hint="다음 진단에서 함께 반영됩니다"
      >
        <Textarea
          id="newConcern"
          name="newConcern"
          rows={3}
          placeholder="예: 인터뷰이 대부분이 가격에 민감하게 반응했다."
        />
      </Field>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Spinner /> : <RefreshCw aria-hidden className="size-4" />}
        {pending ? "다음 진단 준비 중" : "검증 결과로 다음 진단 시작"}
      </Button>
    </form>
  );
}
