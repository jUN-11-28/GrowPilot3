"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md space-y-5 py-20 text-center">
      <h1 className="text-xl font-semibold tracking-tight">문제가 발생했습니다</h1>
      <Alert tone="info">
        요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.
        {error.digest ? (
          <span className="mt-2 block font-mono text-xs text-ink-muted">
            {error.digest}
          </span>
        ) : null}
      </Alert>
      <Button onClick={reset}>
        <RotateCcw aria-hidden className="size-4" />
        다시 시도
      </Button>
    </div>
  );
}
