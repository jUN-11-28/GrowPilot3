"use client";

import { RefreshCw } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Alert, Spinner } from "@/components/ui/feedback";
import {
  submitExperimentResultV2,
  type ExperimentResultFormState,
} from "@/lib/actions/experiments";
import type { ReportV2View } from "@/lib/ai/trace-v2";

const EXECUTION_STATUS_OPTIONS = [
  { value: "not_started", label: "아직 시작하지 않음" },
  { value: "in_progress", label: "진행 중" },
  { value: "completed", label: "완료함" },
  { value: "stopped", label: "중단 조건에 따라 멈춤" },
];

const OUTCOME_OPTIONS = [
  { value: "", label: "아직 판단하기 이릅니다" },
  { value: "supports", label: "지지 — 가설을 뒷받침한다" },
  { value: "does_not_support", label: "반증 — 가설을 뒷받침하지 못한다" },
  { value: "inconclusive", label: "불확실 — 판단하기 애매하다" },
  { value: "incomplete", label: "미완료 — 끝까지 진행하지 못했다" },
];

/**
 * v2-only counterpart to VerificationForm. Writes to `experiment_runs`
 * (not a `project_attachments` note) via the atomic `submit_experiment_result`
 * DB function, so a retry can never create a duplicate run or a duplicate
 * next session — see lib/actions/experiments.ts.
 */
export function VerificationFormV2({
  sessionId,
  experiment,
}: {
  sessionId: string;
  experiment: ReportV2View["next_experiment"];
}) {
  const [state, action, pending] = useActionState<ExperimentResultFormState, FormData>(
    submitExperimentResultV2,
    {},
  );
  // Generated once per mount and resubmitted unchanged on every retry —
  // never regenerated on error, so a resubmission after a failed request
  // still lands on the same experiment_runs row instead of a new one.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  return (
    <form action={action} className="space-y-5 rounded-xl border border-line bg-surface p-6 sm:p-7">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <div className="space-y-1.5">
        <h2 className="text-[15px] font-semibold text-ink">이 행동을 실행했다면, 결과를 남겨 주세요</h2>
        {experiment ? (
          <div className="rounded-lg border border-line-strong bg-surface-muted p-4 text-[13px] leading-relaxed text-ink-secondary">
            <p className="font-medium text-ink">{experiment.title}</p>
            {experiment.hypothesis ? <p className="mt-1">가설: {experiment.hypothesis}</p> : null}
            {experiment.success_criteria?.length ? (
              <p className="mt-1">성공 기준: {experiment.success_criteria.join(" · ")}</p>
            ) : null}
          </div>
        ) : null}
        <p className="text-[13px] leading-relaxed text-ink-secondary">
          여기서 남긴 판단은 창업자 본인의 해석입니다. 다음 진단의 Evidence Agent가 실제 관찰 내용과
          함께 다시 검토합니다.
        </p>
      </div>

      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.saved ? (
        <p className="rounded-md border border-positive/30 bg-positive-soft px-4 py-2.5 text-[13px] text-positive">
          저장했습니다. 준비되면 아래에서 다음 진단을 시작할 수 있습니다.
        </p>
      ) : null}

      <Field label="실행 상태" htmlFor="executionStatus" required>
        <Select id="executionStatus" name="executionStatus" defaultValue="completed">
          {EXECUTION_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="실제로 무엇을 관찰했나요?"
        htmlFor="observedResult"
        required
        hint="숫자·사건 등 실제로 일어난 것만. 해석은 다음 항목에 따로 적어 주세요"
      >
        <Textarea
          id="observedResult"
          name="observedResult"
          required
          rows={4}
          placeholder="예: 8명 인터뷰 완료, 그중 6명이 최근 1개월 내 이 문제를 겪었다고 답했다."
        />
      </Field>

      <Field label="이 기준에 비추어 어떻게 판단하시나요? (선택)" htmlFor="outcome">
        <Select id="outcome" name="outcome" defaultValue="">
          {OUTCOME_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="본인의 해석 (선택)"
        htmlFor="interpretation"
        hint="관찰한 사실과 별개로, 이것이 무엇을 뜻한다고 생각하는지"
      >
        <Textarea id="interpretation" name="interpretation" rows={3} />
      </Field>

      <Field
        label="근거 자료 (선택, 한 줄에 하나씩)"
        htmlFor="evidenceRefs"
        hint="인터뷰 녹취, 스프레드시트 등 참고할 수 있는 것의 이름이나 위치"
      >
        <Textarea id="evidenceRefs" name="evidenceRefs" rows={2} />
      </Field>

      <Field
        label="새로 생긴 고민이나 상황 (선택)"
        htmlFor="newConcern"
        hint="다음 진단에서 함께 반영됩니다"
      >
        <Textarea id="newConcern" name="newConcern" rows={3} />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" name="intent" value="start_next" size="lg" disabled={pending}>
          {pending ? <Spinner /> : <RefreshCw aria-hidden className="size-4" />}
          {pending ? "다음 진단 준비 중" : "결과로 다음 진단 시작"}
        </Button>
        <Button type="submit" name="intent" value="save_only" variant="secondary" disabled={pending}>
          저장만 하기
        </Button>
      </div>
    </form>
  );
}
