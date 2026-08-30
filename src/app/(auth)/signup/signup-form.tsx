"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert, Spinner } from "@/components/ui/feedback";
import { signUp, type AuthFormState } from "@/lib/actions/auth";

export function SignupForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    signUp,
    {},
  );

  if (state.notice) {
    return <Alert tone="info" title="메일을 확인해 주세요">{state.notice}</Alert>;
  }

  return (
    <form action={action} className="space-y-5">
      {state.error ? <Alert>{state.error}</Alert> : null}

      <Field label="이름" htmlFor="displayName" hint="선택">
        <Input id="displayName" name="displayName" autoComplete="name" placeholder="홍길동" />
      </Field>

      <Field label="이메일" htmlFor="email" required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
        />
      </Field>

      <Field label="비밀번호" htmlFor="password" hint="8자 이상" required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null}
        {pending ? "가입 중" : "계정 만들기"}
      </Button>
    </form>
  );
}
