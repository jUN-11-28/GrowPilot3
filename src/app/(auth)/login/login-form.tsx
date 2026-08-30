"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert, Spinner } from "@/components/ui/feedback";
import { signIn, type AuthFormState } from "@/lib/actions/auth";

export function LoginForm({
  redirectTo,
  initialError,
}: {
  redirectTo?: string;
  initialError?: string;
}) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    signIn,
    { error: initialError },
  );

  return (
    <form action={action} className="space-y-5">
      {state.error ? <Alert>{state.error}</Alert> : null}

      <input type="hidden" name="redirectTo" value={redirectTo ?? "/dashboard"} />

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

      <Field label="비밀번호" htmlFor="password" required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="8자 이상"
        />
      </Field>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Spinner /> : null}
        {pending ? "로그인 중" : "로그인"}
      </Button>
    </form>
  );
}
