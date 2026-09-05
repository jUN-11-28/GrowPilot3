"use client";

import { useRouter } from "next/navigation";
import { FileText, Plus, Trash2, X } from "lucide-react";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Choice } from "@/components/ui/choice";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert, Spinner } from "@/components/ui/feedback";
import { createProject, type ProjectFormState } from "@/lib/actions/projects";
import {
  addFilesToEvidenceRecord,
  createEvidenceRecord,
  type FileUploadResult,
} from "@/lib/actions/evidence-records";
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  BUSINESS_MODELS,
  EVIDENCE_LABEL,
  EVIDENCE_RECORD_TYPES,
  EVIDENCE_TYPES,
  MAX_ATTACHMENT_BYTES,
  PROJECT_STAGES,
  TECHNICAL_MATURITIES,
  TECHNOLOGY_TYPES,
} from "@/lib/domain/constants";
import type { EvidenceRecordType, EvidenceType, ProjectStage } from "@/lib/types/database";

interface EvidenceDraft {
  localId: string;
  evidenceType: EvidenceRecordType;
  title: string;
  body: string;
  files: File[];
}

interface DraftUploadState {
  evidenceRecordId?: string;
  error?: string;
  files: { name: string; status: "uploaded" | "failed"; error?: string }[];
}

function validateFile(file: File): string | null {
  if (file.size > MAX_ATTACHMENT_BYTES) return "파일이 너무 큽니다. 15MB 이하로 올려 주세요.";
  if (!(ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "지원하지 않는 형식이에요. PDF, 이미지, 텍스트 파일만 올릴 수 있어요.";
  }
  return null;
}

export function ProjectForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formState, setFormState] = useState<ProjectFormState>({});
  const [stage, setStage] = useState<ProjectStage>("idea");
  const [evidence, setEvidence] = useState<EvidenceType[]>([]);
  const [drafts, setDrafts] = useState<EvidenceDraft[]>([]);
  const [uploadState, setUploadState] = useState<Record<string, DraftUploadState>>({});
  const [phase, setPhase] = useState<"form" | "uploading" | "partial">("form");
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  const fieldErrors = formState.fieldErrors ?? {};

  function toggleEvidence(value: string, checked: boolean) {
    const next = value as EvidenceType;
    if (!checked && drafts.some((d) => d.evidenceType === next)) {
      setFormState({
        error: `${EVIDENCE_LABEL[next]}에 추가한 자료가 있어요. 먼저 아래에서 자료를 지운 뒤 선택을 해제해 주세요.`,
      });
      return;
    }
    if (checked && next === "none" && drafts.length > 0) {
      setFormState({
        error: "추가한 자료가 있어 \"아직 없음\"을 선택할 수 없어요. 먼저 아래에서 자료를 지워 주세요.",
      });
      return;
    }
    setEvidence((current) => {
      if (!checked) return current.filter((item) => item !== next);
      if (next === "none") return ["none"];
      return [...current.filter((item) => item !== "none"), next];
    });
  }

  function addDraft(evidenceType: EvidenceRecordType, draft: { title: string; body: string; files: File[] }) {
    setDrafts((prev) => [...prev, { ...draft, evidenceType, localId: crypto.randomUUID() }]);
  }

  function removeDraft(localId: string) {
    setDrafts((prev) => prev.filter((d) => d.localId !== localId));
  }

  async function uploadAllDrafts(projectId: string, list: EvidenceDraft[]) {
    let allOk = true;
    for (const draft of list) {
      const fd = new FormData();
      fd.set("projectId", projectId);
      fd.set("evidenceType", draft.evidenceType);
      if (draft.title.trim()) fd.set("title", draft.title.trim());
      if (draft.body.trim()) fd.set("body", draft.body.trim());
      for (const file of draft.files) fd.append("files", file);

      const result = await createEvidenceRecord({}, fd);
      if (result.error || !result.evidenceRecordId) {
        allOk = false;
        setUploadState((prev) => ({
          ...prev,
          [draft.localId]: {
            error: result.error ?? "자료를 저장하지 못했습니다.",
            files: draft.files.map((f) => ({ name: f.name, status: "failed" as const })),
          },
        }));
        continue;
      }
      const files = draft.files.map((f, i) => {
        const r: FileUploadResult | undefined = result.fileResults?.[i];
        if (r?.status === "failed") allOk = false;
        return { name: f.name, status: (r?.status ?? "uploaded") as "uploaded" | "failed", error: r?.errorMessage };
      });
      setUploadState((prev) => ({ ...prev, [draft.localId]: { evidenceRecordId: result.evidenceRecordId, files } }));
    }
    return allOk;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    startTransition(async () => {
      const result = await createProject({}, fd);
      if (result.error || result.fieldErrors) {
        setFormState(result);
        return;
      }
      if (!result.projectId) {
        setFormState({ error: "알 수 없는 오류가 발생했습니다. 다시 시도해 주세요." });
        return;
      }
      setFormState({});
      if (drafts.length === 0) {
        router.push(`/projects/${result.projectId}`);
        return;
      }
      setCreatedProjectId(result.projectId);
      setPhase("uploading");
      const allOk = await uploadAllDrafts(result.projectId, drafts);
      if (allOk) {
        router.push(`/projects/${result.projectId}`);
      } else {
        setPhase("partial");
      }
    });
  }

  async function retryDraft(draft: EvidenceDraft) {
    if (!createdProjectId) return;
    setRetryingIds((prev) => new Set(prev).add(draft.localId));
    try {
      await retryDraftInner(draft);
    } finally {
      setRetryingIds((prev) => {
        const next = new Set(prev);
        next.delete(draft.localId);
        return next;
      });
    }
  }

  async function retryDraftInner(draft: EvidenceDraft) {
    if (!createdProjectId) return;
    const state = uploadState[draft.localId];
    const failedNames = new Set((state?.files ?? []).filter((f) => f.status === "failed").map((f) => f.name));
    const failedFiles = draft.files.filter((f) => failedNames.has(f.name));

    if (!state?.evidenceRecordId) {
      // The record itself never got created — try the whole draft again.
      const fd = new FormData();
      fd.set("projectId", createdProjectId);
      fd.set("evidenceType", draft.evidenceType);
      if (draft.title.trim()) fd.set("title", draft.title.trim());
      if (draft.body.trim()) fd.set("body", draft.body.trim());
      for (const file of draft.files) fd.append("files", file);
      const result = await createEvidenceRecord({}, fd);
      if (result.error || !result.evidenceRecordId) {
        setUploadState((prev) => ({
          ...prev,
          [draft.localId]: { error: result.error ?? "다시 저장하지 못했습니다.", files: draft.files.map((f) => ({ name: f.name, status: "failed" as const })) },
        }));
        return;
      }
      const files = draft.files.map((f, i) => {
        const r = result.fileResults?.[i];
        return { name: f.name, status: (r?.status ?? "uploaded") as "uploaded" | "failed", error: r?.errorMessage };
      });
      setUploadState((prev) => ({ ...prev, [draft.localId]: { evidenceRecordId: result.evidenceRecordId, files } }));
      return;
    }

    if (failedFiles.length === 0) return;
    const fd = new FormData();
    fd.set("evidenceRecordId", state.evidenceRecordId);
    fd.set("projectId", createdProjectId);
    for (const file of failedFiles) fd.append("files", file);
    const result = await addFilesToEvidenceRecord({}, fd);
    if (result.error) return;
    let idx = 0;
    setUploadState((prev) => {
      const current = prev[draft.localId];
      if (!current) return prev;
      const nextFiles = current.files.map((f) => {
        if (f.status !== "failed") return f;
        const r = result.fileResults?.[idx];
        idx += 1;
        if (!r) return f;
        return { name: f.name, status: r.status, error: r.errorMessage };
      });
      return { ...prev, [draft.localId]: { ...current, files: nextFiles } };
    });
  }

  const allResolved =
    phase !== "form" &&
    drafts.every((d) => {
      const s = uploadState[d.localId];
      return s && !s.error && s.files.every((f) => f.status === "uploaded");
    });

  if (phase !== "form") {
    return (
      <div className="space-y-6">
        <Alert tone="info">
          프로젝트는 저장됐습니다. 등록한 자료를 올리는 중입니다 — 실패한 파일만 다시 시도할 수
          있어요.
        </Alert>
        <ul className="space-y-3">
          {drafts.map((draft) => {
            const state = uploadState[draft.localId];
            return (
              <li key={draft.localId} className="space-y-2 rounded-lg border border-line p-4">
                <p className="text-[13px] font-medium text-ink">
                  {EVIDENCE_LABEL[draft.evidenceType]} · {draft.title || "(제목 없음)"}
                </p>
                {state?.error ? <Alert>{state.error}</Alert> : null}
                {(state?.files ?? []).map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-[13px] text-ink-secondary">
                    <FileText aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
                    <span className="truncate">{f.name}</span>
                    <Badge tone={f.status === "uploaded" ? "positive" : "critical"}>
                      {f.status === "uploaded" ? "업로드 완료" : "실패"}
                    </Badge>
                  </div>
                ))}
                {state && (state.error || state.files.some((f) => f.status === "failed")) ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => retryDraft(draft)}
                    disabled={retryingIds.has(draft.localId)}
                  >
                    {retryingIds.has(draft.localId) ? <Spinner className="size-3.5" /> : null}
                    다시 시도
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-3 border-t border-line pt-6">
          <Button
            onClick={() => createdProjectId && router.push(`/projects/${createdProjectId}`)}
            disabled={!createdProjectId || pending || retryingIds.size > 0}
          >
            {pending ? <Spinner className="size-3.5" /> : null}
            {pending
              ? "자료 업로드 중"
              : allResolved
                ? "프로젝트로 이동"
                : "나머지는 나중에 — 프로젝트로 이동"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-9">
      {formState.error ? <Alert>{formState.error}</Alert> : null}

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

      <fieldset className="space-y-4">
        <legend className="text-[13px] font-medium text-ink">
          현재 확보한 Evidence
        </legend>
        <p className="text-xs leading-relaxed text-ink-secondary">
          아직 없어도 괜찮습니다. 근거가 없다는 사실 자체가 다음 실험의 출발점이 됩니다. 종류를
          선택하면 아래에서 실제로 무엇을 확인했는지 글이나 파일로 남길 수 있어요 — 이미 작성한
          기록이 있다면 파일로 올려주세요.
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

        {EVIDENCE_RECORD_TYPES.filter((option) => evidence.includes(option.value)).map((option) => (
          <EvidenceDraftSection
            key={option.value}
            evidenceType={option.value}
            drafts={drafts.filter((d) => d.evidenceType === option.value)}
            onAdd={(draft) => addDraft(option.value, draft)}
            onRemove={removeDraft}
          />
        ))}
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

function EvidenceDraftSection({
  evidenceType,
  drafts,
  onAdd,
  onRemove,
}: {
  evidenceType: EvidenceRecordType;
  drafts: EvidenceDraft[];
  onAdd: (draft: { title: string; body: string; files: File[] }) => void;
  onRemove: (localId: string) => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface-muted p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-ink">{EVIDENCE_LABEL[evidenceType]} 자료</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-muted">{drafts.length}건 추가됨</span>
          <Button type="button" variant="secondary" size="sm" onClick={() => setAdding((v) => !v)}>
            <Plus aria-hidden className="size-3.5" />
            자료 추가
          </Button>
        </div>
      </div>

      {drafts.length > 0 ? (
        <ul className="space-y-1.5">
          {drafts.map((draft) => (
            <li
              key={draft.localId}
              className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2 text-[13px]"
            >
              <span className="min-w-0 truncate text-ink">
                {draft.title || "(제목 없음)"}
                {draft.files.length > 0 ? ` · 파일 ${draft.files.length}개` : ""}
              </span>
              <button
                type="button"
                onClick={() => onRemove(draft.localId)}
                aria-label="삭제"
                className="shrink-0 text-ink-muted hover:text-danger"
              >
                <Trash2 aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <EvidenceDraftForm
          onSave={(draft) => {
            onAdd(draft);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}
    </div>
  );
}

function EvidenceDraftForm({
  onSave,
  onCancel,
}: {
  onSave: (draft: { title: string; body: string; files: File[] }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: File[] = [];
    for (const file of Array.from(list)) {
      const invalid = validateFile(file);
      if (invalid) {
        setError(`${file.name}: ${invalid}`);
        continue;
      }
      next.push(file);
    }
    setFiles((prev) => [...prev, ...next]);
  }

  function save() {
    if (!body.trim() && files.length === 0) {
      setError("내용을 적거나 파일을 올려야 자료를 추가할 수 있어요.");
      return;
    }
    onSave({ title, body, files });
  }

  return (
    <div className="space-y-3 rounded-md border border-dashed border-line-strong bg-surface p-3">
      {error ? <Alert>{error}</Alert> : null}
      <Field label="제목 (선택)" htmlFor="draft-title" hint="비우면 파일명이나 종류로 자동 지정돼요">
        <Input id="draft-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="내용" htmlFor="draft-body" hint="파일 없이 글로만 적어도 돼요">
        <Textarea
          id="draft-body"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="예: 이미 작성한 기록이 있다면 여기에 붙여 넣거나 아래에서 파일로 올려주세요."
        />
      </Field>
      <Field
        label="첨부 파일 (선택)"
        htmlFor="draft-files"
        hint="PDF, 이미지, 텍스트 · 15MB 이하 · 여러 개 선택 가능 · 여러 인터뷰가 들어 있는 파일도 괜찮아요"
      >
        <input
          id="draft-files"
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.txt,.csv"
          onChange={(e) => addFiles(e.target.files)}
          className="block w-full text-[13px] text-ink-secondary file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-ink hover:file:bg-surface-muted"
        />
      </Field>
      {files.length > 0 ? (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-1.5 text-xs text-ink-secondary">
              <FileText aria-hidden className="size-3 shrink-0" />
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                className="text-ink-muted hover:text-ink"
              >
                <X aria-hidden className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={save}>
          추가
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          취소
        </Button>
      </div>
    </div>
  );
}
