"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Choice } from "@/components/ui/choice";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert, Spinner } from "@/components/ui/feedback";
import {
  createProject,
  type ProjectFormState,
} from "@/lib/actions/projects";
import { EVIDENCE_TYPES, PROJECT_STAGES } from "@/lib/domain/constants";
import type { EvidenceType, ProjectStage } from "@/lib/types/database";

export function ProjectForm() {
  const [state, action, pending] = useActionState<ProjectFormState, FormData>(
    createProject,
    {},
  );
  const [stage, setStage] = useState<ProjectStage>("idea");
  const [evidence, setEvidence] = useState<EvidenceType[]>([]);

  function toggleEvidence(value: string, checked: boolean) {
    const next = value as EvidenceType;
    setEvidence((current) => {
      if (!checked) return current.filter((item) => item !== next);
      // "아직 없음"은 단독 선택.
      if (next === "none") return ["none"];
      return [...current.filter((item) => item !== "none"), next];
    });
  }

  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-9">
      {state.error ? <Alert>{state.error}</Alert> : null}

      <Field label="프로젝트명" htmlFor="name" required error={fieldErrors.name}>
        <Input id="name" name="name" required placeholder="예: 소상공인 재고 관리 SaaS" />
      </Field>

      <Field
        label="해결하려는 문제"
        htmlFor="problem"
        required
        hint="누가, 어떤 상황에서 겪는 문제인가"
        error={fieldErrors.problem}
      >
        <Textarea
          id="problem"
          name="problem"
          required
          rows={4}
          placeholder="예: 동네 카페 사장님은 재고를 수기로 관리해 매주 폐기 손실이 발생한다."
        />
      </Field>

      <Field
        label="타깃 고객"
        htmlFor="target_customer"
        required
        hint="구체적일수록 진단이 정확해집니다"
        error={fieldErrors.target_customer}
      >
        <Textarea
          id="target_customer"
          name="target_customer"
          required
          rows={3}
          placeholder="예: 직원 5인 이하, 월매출 2천만원 이하의 개인 카페 운영자"
        />
      </Field>

      <Field label="해결 방법" htmlFor="solution" required error={fieldErrors.solution}>
        <Textarea
          id="solution"
          name="solution"
          required
          rows={4}
          placeholder="예: 영수증 사진 한 장으로 재고를 자동 차감하는 모바일 앱"
        />
      </Field>

      <fieldset className="space-y-3">
        <legend className="text-[13px] font-medium text-ink">현재 진행 단계</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PROJECT_STAGES.map((option) => (
            <Choice
              key={option.value}
              type="radio"
              name="stage"
              value={option.value}
              label={option.label}
              description={option.description}
              checked={stage === option.value}
              onChange={(value) => setStage(value as ProjectStage)}
            />
          ))}
        </div>
        {fieldErrors.stage ? (
          <p className="text-xs text-danger">{fieldErrors.stage}</p>
        ) : null}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-[13px] font-medium text-ink">
          현재 확보한 Evidence
        </legend>
        <p className="text-xs leading-relaxed text-ink-secondary">
          아직 없어도 괜찮습니다. 근거가 없다는 사실 자체가 다음 실험의 출발점이 됩니다.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {EVIDENCE_TYPES.map((option) => (
            <Choice
              key={option.value}
              type="checkbox"
              name="evidence"
              value={option.value}
              label={option.label}
              description={option.description}
              checked={evidence.includes(option.value)}
              onChange={toggleEvidence}
            />
          ))}
        </div>
      </fieldset>

      <div className="flex items-center gap-3 border-t border-line pt-6">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Spinner /> : null}
          {pending ? "저장 중" : "프로젝트 만들기"}
        </Button>
      </div>
    </form>
  );
}
