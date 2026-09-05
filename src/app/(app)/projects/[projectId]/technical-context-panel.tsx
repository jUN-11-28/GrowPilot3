"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert, Spinner } from "@/components/ui/feedback";
import {
  updateProjectContext,
  type ProjectContextFormState,
} from "@/lib/actions/projects";
import {
  BUSINESS_MODELS,
  TECHNICAL_MATURITIES,
  TECHNOLOGY_TYPES,
} from "@/lib/domain/constants";
import type { ExecutionConstraints, TechnicalContext } from "@/lib/types/database";

/**
 * The project-creation form only asks the minimum. This panel is the "add or
 * edit it later" path prompt doc §2.C requires instead of a full project-edit
 * feature — every field stays optional and an untouched field reads back as
 * null, not 0 or an empty string.
 */
export function TechnicalContextPanel({
  projectId,
  technicalContext,
  executionConstraints,
}: {
  projectId: string;
  technicalContext: TechnicalContext | null;
  executionConstraints: ExecutionConstraints | null;
}) {
  const [editing, setEditing] = useState(
    technicalContext === null && executionConstraints === null,
  );
  const [state, action, pending] = useActionState<ProjectContextFormState, FormData>(
    updateProjectContext,
    {},
  );

  // A successful save leaves edit mode so the read view picks up the fresh
  // props `revalidatePath` brought in — without this, the form stayed open
  // showing stale `defaultValue`s and looked like the save did nothing.
  // Adjusted during render (React's documented alternative to an effect for
  // reacting to a changed value) rather than in a useEffect, which would
  // cause an extra cascading render for the same outcome.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.saved) setEditing(false);
  }

  if (!editing) {
    return (
      <div className="space-y-4">
        <dl className="grid gap-4 sm:grid-cols-2">
          <ReadRow label="기술 유형" value={findLabel(TECHNOLOGY_TYPES, technicalContext?.technology_type)} />
          <ReadRow label="판매 구조" value={findLabel(BUSINESS_MODELS, technicalContext?.business_model)} />
          <ReadRow label="실사용자" value={technicalContext?.user_role} />
          <ReadRow label="구매 결정자" value={technicalContext?.buyer_role} />
          <ReadRow
            label="기술 성숙도"
            value={findLabel(TECHNICAL_MATURITIES, technicalContext?.technical_maturity)}
          />
          <ReadRow
            label="평균 판매 주기"
            value={technicalContext?.sales_cycle_days != null ? `${technicalContext.sales_cycle_days}일` : null}
          />
          <ReadRow
            label="주당 투입 가능 시간"
            value={
              executionConstraints?.hours_per_week != null
                ? `${executionConstraints.hours_per_week}시간`
                : null
            }
          />
          <ReadRow
            label="예산"
            value={
              executionConstraints?.budget_amount != null
                ? `${executionConstraints.budget_amount}${executionConstraints.budget_currency ?? ""}`
                : null
            }
          />
          <ReadRow label="고객 접근 경로" value={executionConstraints?.customer_access} />
          <ReadRow label="시험 환경 접근성" value={executionConstraints?.test_environment_access} />
        </dl>
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
          정보 추가·수정
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="projectId" value={projectId} />
      {state.error ? <Alert>{state.error}</Alert> : null}
      <p className="text-[13px] leading-relaxed text-ink-secondary">
        모두 선택 항목입니다. 모르면 비워 두세요 — 비워 둔 항목은 진단에서 &ldquo;모름&rdquo;으로
        다뤄지고, 임의의 값으로 채워지지 않습니다.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="기술 유형" htmlFor="technology_type">
          <Select id="technology_type" name="technology_type" defaultValue={technicalContext?.technology_type ?? ""}>
            <option value="">모름 / 선택 안 함</option>
            {TECHNOLOGY_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="판매 구조" htmlFor="business_model">
          <Select id="business_model" name="business_model" defaultValue={technicalContext?.business_model ?? ""}>
            <option value="">모름 / 선택 안 함</option>
            {BUSINESS_MODELS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="실사용자" htmlFor="user_role" hint="예: 현장 작업자 본인">
          <Input id="user_role" name="user_role" defaultValue={technicalContext?.user_role ?? ""} />
        </Field>
        <Field label="구매 결정자" htmlFor="buyer_role" hint="예: 구매팀, 시설관리자">
          <Input id="buyer_role" name="buyer_role" defaultValue={technicalContext?.buyer_role ?? ""} />
        </Field>
        <Field label="기술 성숙도" htmlFor="technical_maturity">
          <Select
            id="technical_maturity"
            name="technical_maturity"
            defaultValue={technicalContext?.technical_maturity ?? ""}
          >
            <option value="">모름 / 선택 안 함</option>
            {TECHNICAL_MATURITIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="평균 판매 주기 (일)" htmlFor="sales_cycle_days">
          <Input
            id="sales_cycle_days"
            name="sales_cycle_days"
            type="number"
            min={0}
            defaultValue={technicalContext?.sales_cycle_days ?? ""}
          />
        </Field>
        <Field label="반복 사용 주기 (일)" htmlFor="usage_cycle_days">
          <Input
            id="usage_cycle_days"
            name="usage_cycle_days"
            type="number"
            min={0}
            defaultValue={technicalContext?.usage_cycle_days ?? ""}
          />
        </Field>
        <Field label="주당 투입 가능 시간" htmlFor="hours_per_week">
          <Input
            id="hours_per_week"
            name="hours_per_week"
            type="number"
            min={0}
            max={168}
            defaultValue={executionConstraints?.hours_per_week ?? ""}
          />
        </Field>
        <Field label="예산" htmlFor="budget_amount">
          <Input
            id="budget_amount"
            name="budget_amount"
            type="number"
            min={0}
            defaultValue={executionConstraints?.budget_amount ?? ""}
          />
        </Field>
        <Field label="예산 통화" htmlFor="budget_currency" hint="예: KRW, USD">
          <Input
            id="budget_currency"
            name="budget_currency"
            defaultValue={executionConstraints?.budget_currency ?? ""}
          />
        </Field>
      </div>

      <Field label="고객 접근 경로" htmlFor="customer_access" hint="예: 지인 네트워크, 특정 커뮤니티, 아직 없음">
        <Textarea
          id="customer_access"
          name="customer_access"
          rows={2}
          defaultValue={executionConstraints?.customer_access ?? ""}
        />
      </Field>
      <Field
        label="시험·검증 환경 접근성"
        htmlFor="test_environment_access"
        hint="예: 자체 실험실 보유, 협력 공장 통해서만 시험 가능"
      >
        <Textarea
          id="test_environment_access"
          name="test_environment_access"
          rows={2}
          defaultValue={executionConstraints?.test_environment_access ?? ""}
        />
      </Field>
      <Field
        label="고정 제약 (한 줄에 하나씩)"
        htmlFor="hard_constraints"
        hint="예: 인허가 승인 전에는 판매 불가"
      >
        <Textarea
          id="hard_constraints"
          name="hard_constraints"
          rows={3}
          defaultValue={executionConstraints?.hard_constraints.join("\n") ?? ""}
        />
      </Field>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner className="size-3.5" /> : null}
          {pending ? "저장 중" : "저장"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
          취소
        </Button>
      </div>
    </form>
  );
}

function findLabel(
  options: readonly { value: string; label: string }[],
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return options.find((o) => o.value === value)?.label ?? value;
}

function ReadRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className="text-sm text-ink">{value ?? <span className="text-ink-muted">모름</span>}</dd>
    </div>
  );
}
