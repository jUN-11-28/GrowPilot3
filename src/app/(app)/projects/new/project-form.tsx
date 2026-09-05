"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Choice } from "@/components/ui/choice";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert, Spinner } from "@/components/ui/feedback";
import {
  createProject,
  type ProjectFormState,
} from "@/lib/actions/projects";
import {
  BUSINESS_MODELS,
  EVIDENCE_TYPES,
  PROJECT_STAGES,
  TECHNICAL_MATURITIES,
  TECHNOLOGY_TYPES,
} from "@/lib/domain/constants";
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

      <details className="space-y-5 rounded-lg border border-line p-4">
        <summary className="cursor-pointer text-[13px] font-medium text-ink">
          기술·실행 정보 (선택 — 나중에 프로젝트 화면에서도 추가·수정할 수 있습니다)
        </summary>
        <p className="text-xs leading-relaxed text-ink-secondary">
          소프트웨어·AI뿐 아니라 하드웨어·로보틱스 등 기술 유형과 판매 방식, 시간·예산
          여건에 맞춰 진단하는 데 씁니다. 모르면 비워 두세요.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="기술 유형" htmlFor="technology_type">
            <Select id="technology_type" name="technology_type" defaultValue="">
              <option value="">모름 / 선택 안 함</option>
              {TECHNOLOGY_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="판매 구조" htmlFor="business_model">
            <Select id="business_model" name="business_model" defaultValue="">
              <option value="">모름 / 선택 안 함</option>
              {BUSINESS_MODELS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="기술 성숙도" htmlFor="technical_maturity">
            <Select id="technical_maturity" name="technical_maturity" defaultValue="">
              <option value="">모름 / 선택 안 함</option>
              {TECHNICAL_MATURITIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="주당 투입 가능 시간" htmlFor="hours_per_week">
            <Input id="hours_per_week" name="hours_per_week" type="number" min={0} max={168} />
          </Field>
          <Field label="예산" htmlFor="budget_amount">
            <Input id="budget_amount" name="budget_amount" type="number" min={0} />
          </Field>
          <Field label="예산 통화" htmlFor="budget_currency" hint="예: KRW, USD">
            <Input id="budget_currency" name="budget_currency" />
          </Field>
        </div>
        <Field
          label="고객 접근 경로"
          htmlFor="customer_access"
          hint="예: 지인 네트워크, 특정 커뮤니티, 아직 없음"
        >
          <Textarea id="customer_access" name="customer_access" rows={2} />
        </Field>
        <Field
          label="시험·검증 환경 접근성"
          htmlFor="test_environment_access"
          hint="예: 자체 실험실 보유, 협력 공장 통해서만 시험 가능"
        >
          <Textarea id="test_environment_access" name="test_environment_access" rows={2} />
        </Field>
      </details>

      <div className="flex items-center gap-3 border-t border-line pt-6">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Spinner /> : null}
          {pending ? "저장 중" : "프로젝트 만들기"}
        </Button>
      </div>
    </form>
  );
}
