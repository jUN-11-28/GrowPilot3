"use client";

import { FileText, Plus, Sparkles, Trash2, X } from "lucide-react";
import {
  useMemo,
  useState,
  useTransition,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert, Spinner } from "@/components/ui/feedback";
import {
  addFilesToEvidenceRecord,
  analyzeEvidenceRecord,
  confirmEvidenceSummary,
  createEvidenceRecord,
  deleteEvidenceRecord,
  linkExistingAttachment,
  unlinkEvidenceAttachment,
  updateEvidenceRecord,
  type FileUploadResult,
} from "@/lib/actions/evidence-records";
import type { EvidenceRecordDraftV2 } from "@/lib/ai/schemas-v2";
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  EVIDENCE_LABEL,
  EVIDENCE_RECORD_ANALYSIS_STATUS_LABEL,
  MAX_ATTACHMENT_BYTES,
} from "@/lib/domain/constants";
import { formatDate } from "@/lib/utils";
import type {
  EvidenceRecordAttachmentRow,
  EvidenceRecordRow,
  EvidenceRecordType,
  ProjectAttachmentRow,
} from "@/lib/types/database";

const PURCHASE_SIGNAL_LABEL: Record<string, string> = {
  interest: "구매 관심",
  intent: "구매 의향",
  contract: "계약",
  payment: "실제 결제",
};

type PendingFile = {
  file: File;
  status: "pending" | "uploading" | "uploaded" | "failed";
  errorMessage?: string;
};

function validateFile(file: File): string | null {
  if (file.size > MAX_ATTACHMENT_BYTES) return "파일이 너무 큽니다. 15MB 이하로 올려 주세요.";
  if (!(ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "지원하지 않는 형식이에요. PDF, 이미지, 텍스트 파일만 올릴 수 있어요.";
  }
  return null;
}

export function EvidenceRecordsPanel({
  projectId,
  evidenceTypes,
  records,
  attachmentLinks,
  attachments,
}: {
  projectId: string;
  evidenceTypes: EvidenceRecordType[];
  records: EvidenceRecordRow[];
  attachmentLinks: EvidenceRecordAttachmentRow[];
  attachments: ProjectAttachmentRow[];
}) {
  const attachmentsById = useMemo(() => new Map(attachments.map((a) => [a.id, a])), [attachments]);
  const linkedAttachmentIds = useMemo(
    () => new Set(attachmentLinks.map((l) => l.attachment_id)),
    [attachmentLinks],
  );
  const unlinkedAttachments = useMemo(
    () => attachments.filter((a) => !linkedAttachmentIds.has(a.id)),
    [attachments, linkedAttachmentIds],
  );
  const linksByRecord = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const link of attachmentLinks) {
      const list = map.get(link.evidence_record_id) ?? [];
      list.push(link.attachment_id);
      map.set(link.evidence_record_id, list);
    }
    return map;
  }, [attachmentLinks]);
  const recordsByType = useMemo(() => {
    const map = new Map<string, EvidenceRecordRow[]>();
    for (const r of records) {
      const list = map.get(r.evidence_type) ?? [];
      list.push(r);
      map.set(r.evidence_type, list);
    }
    return map;
  }, [records]);

  if (evidenceTypes.length === 0) {
    return (
      <p className="text-[13px] leading-relaxed text-ink-secondary">
        아직 선택한 Evidence 종류가 없습니다. 위 &ldquo;확보한 Evidence&rdquo;에서 먼저 종류를
        선택해 주세요.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {evidenceTypes.map((type) => (
        <EvidenceTypeSection
          key={type}
          projectId={projectId}
          evidenceType={type}
          records={recordsByType.get(type) ?? []}
          linksByRecord={linksByRecord}
          attachmentsById={attachmentsById}
          unlinkedAttachments={unlinkedAttachments}
        />
      ))}
    </div>
  );
}

function EvidenceTypeSection({
  projectId,
  evidenceType,
  records,
  linksByRecord,
  attachmentsById,
  unlinkedAttachments,
}: {
  projectId: string;
  evidenceType: EvidenceRecordType;
  records: EvidenceRecordRow[];
  linksByRecord: Map<string, string[]>;
  attachmentsById: Map<string, ProjectAttachmentRow>;
  unlinkedAttachments: ProjectAttachmentRow[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-semibold text-ink">{EVIDENCE_LABEL[evidenceType]}</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-muted">등록된 자료 {records.length}건</span>
          <Button variant="secondary" size="sm" onClick={() => setAdding((v) => !v)}>
            <Plus aria-hidden className="size-3.5" />
            자료 추가
          </Button>
        </div>
      </div>

      {records.length === 0 && !adding ? (
        <p className="rounded-md border border-dashed border-line px-4 py-3 text-[13px] text-ink-secondary">
          상세 자료 없음 — 이미 작성한 기록이 있다면 파일로 올려주세요. 여러 인터뷰가 들어 있는
          파일도 괜찮아요. 파일 없이 글로만 적어도 돼요.
        </p>
      ) : null}

      {adding ? (
        <EvidenceRecordCreateForm
          projectId={projectId}
          evidenceType={evidenceType}
          unlinkedAttachments={unlinkedAttachments}
          onDone={() => setAdding(false)}
        />
      ) : null}

      <div className="space-y-3">
        {records.map((record) => (
          <EvidenceRecordCard
            key={record.id}
            projectId={projectId}
            record={record}
            attachmentIds={linksByRecord.get(record.id) ?? []}
            attachmentsById={attachmentsById}
            unlinkedAttachments={unlinkedAttachments}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

function EvidenceRecordCreateForm({
  projectId,
  evidenceType,
  unlinkedAttachments,
  onDone,
}: {
  projectId: string;
  evidenceType: EvidenceRecordType;
  unlinkedAttachments: ProjectAttachmentRow[];
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [targetDescription, setTargetDescription] = useState("");
  const [interviewCount, setInterviewCount] = useState("");
  const [uniqueParticipantCount, setUniqueParticipantCount] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: PendingFile[] = [];
    for (const file of Array.from(list)) {
      const invalid = validateFile(file);
      if (invalid) {
        setError(`${file.name}: ${invalid}`);
        continue;
      }
      next.push({ file, status: "pending" });
    }
    setFiles((prev) => [...prev, ...next]);
  }

  function submit() {
    if (!body.trim() && files.length === 0) {
      setError("내용을 적거나 파일을 올려야 자료를 저장할 수 있어요.");
      return;
    }
    setError(null);
    setFiles((prev) => prev.map((f) => ({ ...f, status: "uploading" })));
    startTransition(async () => {
      const fd = new FormData();
      fd.set("projectId", projectId);
      fd.set("evidenceType", evidenceType);
      if (title.trim()) fd.set("title", title.trim());
      if (body.trim()) fd.set("body", body.trim());
      if (occurredAt.trim()) fd.set("occurredAt", occurredAt.trim());
      if (targetDescription.trim()) fd.set("targetDescription", targetDescription.trim());
      if (interviewCount.trim()) fd.set("interviewCount", interviewCount.trim());
      if (uniqueParticipantCount.trim()) fd.set("uniqueParticipantCount", uniqueParticipantCount.trim());
      for (const f of files) fd.append("files", f.file);

      const result = await createEvidenceRecord({}, fd);
      if (result.error) {
        setError(result.error);
        setFiles((prev) => prev.map((f) => ({ ...f, status: "pending" })));
        return;
      }
      setCreatedId(result.evidenceRecordId ?? null);
      applyFileResults(setFiles, result.fileResults);
      if (!result.fileResults?.some((r) => r.status === "failed")) {
        onDone();
      }
    });
  }

  function retry() {
    if (!createdId) return;
    const failed = files.filter((f) => f.status === "failed");
    if (failed.length === 0) return;
    setFiles((prev) => prev.map((f) => (f.status === "failed" ? { ...f, status: "uploading" } : f)));
    startTransition(async () => {
      const fd = new FormData();
      fd.set("evidenceRecordId", createdId);
      fd.set("projectId", projectId);
      for (const f of failed) fd.append("files", f.file);
      const result = await addFilesToEvidenceRecord({}, fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      applyRetryResults(setFiles, result.fileResults);
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-dashed border-line-strong p-4">
      {error ? <Alert>{error}</Alert> : null}
      <Field label="제목 (선택)" htmlFor="new-title" hint="비우면 파일명이나 종류로 자동 지정돼요">
        <Input id="new-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="내용" htmlFor="new-body" hint="파일 없이 글로만 적어도 돼요">
        <Textarea
          id="new-body"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="예: 3월 둘째 주에 카페 사장님 3명과 이야기했다. 재고 손실이 매주 발생한다고 했다."
        />
      </Field>
      <Field
        label="첨부 파일 (선택)"
        htmlFor="new-files"
        hint="PDF, 이미지, 텍스트 · 15MB 이하 · 여러 개 선택 가능 · 여러 인터뷰가 들어 있는 파일도 괜찮아요"
      >
        <input
          id="new-files"
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.txt,.csv"
          onChange={(e) => addFiles(e.target.files)}
          className="block w-full text-[13px] text-ink-secondary file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-ink hover:file:bg-surface-muted"
        />
      </Field>
      {files.length > 0 ? (
        <ul className="space-y-1.5">
          {files.map((f, i) => (
            <FileStatusRow key={i} entry={f} />
          ))}
        </ul>
      ) : null}
      {unlinkedAttachments.length > 0 ? (
        <p className="text-xs text-ink-muted">
          이미 올린 파일을 이 자료에 연결하려면 저장 후 아래 &ldquo;기존 파일 연결&rdquo;을
          이용하세요.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="날짜 (선택)" htmlFor="new-occurred" hint="모르면 비워 두세요">
          <Input
            id="new-occurred"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            placeholder="예: 2026년 3월 둘째 주"
          />
        </Field>
        <Field label="대상 (선택)" htmlFor="new-target">
          <Input
            id="new-target"
            value={targetDescription}
            onChange={(e) => setTargetDescription(e.target.value)}
            placeholder="예: 카페 운영자"
          />
        </Field>
        <Field label="인터뷰/응답 횟수 (선택)" htmlFor="new-interview-count">
          <Input
            id="new-interview-count"
            type="number"
            min={0}
            value={interviewCount}
            onChange={(e) => setInterviewCount(e.target.value)}
          />
        </Field>
        <Field
          label="고유 참여자 수 (선택)"
          htmlFor="new-participant-count"
          hint="같은 사람을 여러 번 인터뷰했다면 사람 수만"
        >
          <Input
            id="new-participant-count"
            type="number"
            min={0}
            value={uniqueParticipantCount}
            onChange={(e) => setUniqueParticipantCount(e.target.value)}
          />
        </Field>
      </div>

      <div className="flex items-center gap-2">
        {createdId && files.some((f) => f.status === "failed") ? (
          <Button type="button" variant="secondary" size="sm" onClick={retry} disabled={pending}>
            {pending ? <Spinner className="size-3.5" /> : null}
            실패한 파일만 다시 시도
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={submit} disabled={pending || createdId !== null}>
            {pending ? <Spinner className="size-3.5" /> : null}
            {pending ? "저장 중" : "저장"}
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={pending}>
          {createdId ? "닫기" : "취소"}
        </Button>
      </div>
    </div>
  );
}

function applyFileResults(
  setFiles: Dispatch<SetStateAction<PendingFile[]>>,
  fileResults: FileUploadResult[] | undefined,
) {
  if (!fileResults) return;
  setFiles((prev) =>
    prev.map((entry, i) => {
      const r = fileResults[i];
      if (!r) return entry;
      return { ...entry, status: r.status, errorMessage: r.errorMessage };
    }),
  );
}

function applyRetryResults(
  setFiles: Dispatch<SetStateAction<PendingFile[]>>,
  fileResults: FileUploadResult[] | undefined,
) {
  if (!fileResults) return;
  setFiles((prev) => {
    let idx = 0;
    return prev.map((entry) => {
      if (entry.status !== "uploading") return entry;
      const r = fileResults[idx];
      idx += 1;
      if (!r) return entry;
      return { ...entry, status: r.status, errorMessage: r.errorMessage };
    });
  });
}

function FileStatusRow({ entry }: { entry: PendingFile }) {
  const label =
    entry.status === "pending"
      ? "대기 중"
      : entry.status === "uploading"
        ? "업로드 중"
        : entry.status === "uploaded"
          ? "업로드 완료"
          : "실패";
  const tone =
    entry.status === "uploaded" ? "positive" : entry.status === "failed" ? "critical" : "neutral";
  return (
    <li className="flex items-center gap-2 text-[13px] text-ink-secondary">
      {entry.status === "uploading" ? (
        <Spinner className="size-3.5" />
      ) : (
        <FileText aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
      )}
      <span className="truncate">{entry.file.name}</span>
      <Badge tone={tone}>{label}</Badge>
      {entry.errorMessage ? <span className="text-xs text-danger">{entry.errorMessage}</span> : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Card (existing record)
// ---------------------------------------------------------------------------

function EvidenceRecordCard({
  projectId,
  record,
  attachmentIds,
  attachmentsById,
  unlinkedAttachments,
}: {
  projectId: string;
  record: EvidenceRecordRow;
  attachmentIds: string[];
  attachmentsById: Map<string, ProjectAttachmentRow>;
  unlinkedAttachments: ProjectAttachmentRow[];
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [linking, setLinking] = useState(false);
  const [analyzePending, startAnalyze] = useTransition();
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [deletePending, startDelete] = useTransition();

  const draft = (record.ai_draft as EvidenceRecordDraftV2 | null) ?? null;
  const confirmedSummary = (record.user_confirmed_summary as EvidenceRecordDraftV2 | null) ?? null;
  const draftIsFresh = record.ai_draft_source_version === record.source_version;
  const confirmedIsStale =
    record.confirmed_at !== null && record.confirmed_source_version !== record.source_version;

  function runAnalyze() {
    setAnalyzeError(null);
    startAnalyze(async () => {
      const fd = new FormData();
      fd.set("id", record.id);
      fd.set("projectId", projectId);
      const result = await analyzeEvidenceRecord({}, fd);
      if (result.error) setAnalyzeError(result.error);
    });
  }

  function remove() {
    if (!confirm("이 자료를 삭제할까요? 연결된 파일 자체는 삭제되지 않습니다.")) return;
    startDelete(async () => {
      const fd = new FormData();
      fd.set("id", record.id);
      fd.set("projectId", projectId);
      await deleteEvidenceRecord(fd);
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-[14px] font-medium text-ink">{record.title}</p>
          <p className="text-xs text-ink-muted">{formatDate(record.updated_at)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge tone={record.analysis_status === "completed" ? "positive" : record.analysis_status === "failed" ? "critical" : "neutral"}>
            {EVIDENCE_RECORD_ANALYSIS_STATUS_LABEL[record.analysis_status]}
          </Badge>
          <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
            수정
          </Button>
          <Button variant="ghost" size="sm" onClick={remove} disabled={deletePending}>
            {deletePending ? <Spinner className="size-3.5" /> : <Trash2 aria-hidden className="size-3.5" />}
          </Button>
        </div>
      </div>

      {record.body ? (
        <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink-secondary">
          {record.body}
        </p>
      ) : (
        <p className="text-[13px] text-ink-muted">글 없음 — 첨부 파일만 있어요.</p>
      )}

      <AttachmentChips
        projectId={projectId}
        recordId={record.id}
        attachmentIds={attachmentIds}
        attachmentsById={attachmentsById}
      />

      {unlinkedAttachments.length > 0 ? (
        <div>
          <Button variant="ghost" size="sm" onClick={() => setLinking((v) => !v)}>
            기존 파일 연결
          </Button>
          {linking ? (
            <LinkExistingAttachmentForm
              projectId={projectId}
              recordId={record.id}
              options={unlinkedAttachments}
              onDone={() => setLinking(false)}
            />
          ) : null}
        </div>
      ) : null}

      {editing ? (
        <EvidenceRecordEditForm
          projectId={projectId}
          record={record}
          hasAttachments={attachmentIds.length > 0}
          onDone={() => setEditing(false)}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Button variant="secondary" size="sm" onClick={runAnalyze} disabled={analyzePending || record.analysis_status === "analyzing"}>
          {analyzePending || record.analysis_status === "analyzing" ? (
            <Spinner className="size-3.5" />
          ) : (
            <Sparkles aria-hidden className="size-3.5" />
          )}
          AI로 정리
        </Button>
        {(draft && draftIsFresh) || confirmedSummary ? (
          <Button variant="ghost" size="sm" onClick={() => setConfirming((v) => !v)}>
            {confirmedSummary ? "확인한 요약 보기" : "AI 초안 확인"}
          </Button>
        ) : null}
      </div>
      {analyzeError ? <Alert>{analyzeError}</Alert> : null}

      {confirmedSummary ? (
        <div className="space-y-2 rounded-md border border-positive/20 bg-positive-soft p-3">
          <p className="text-xs font-medium text-positive">
            창업자가 확인한 요약{confirmedIsStale ? " · 이전 버전 — 자료가 수정되어 다시 확인이 필요해요" : ""}
          </p>
          <SummaryView draft={confirmedSummary} />
        </div>
      ) : draft && draftIsFresh ? (
        <div className="space-y-2 rounded-md border border-line-strong bg-surface-muted p-3">
          <p className="text-xs font-medium text-ink-secondary">
            AI가 정리한 내용이 맞는지 확인해주세요 (아직 미확인)
          </p>
          <SummaryView draft={draft} />
        </div>
      ) : draft && !draftIsFresh ? (
        <p className="text-[13px] text-ink-muted">
          이전 버전 AI 정리 — 자료가 수정되어 다시 정리가 필요해요.
        </p>
      ) : null}

      {confirming ? (
        <ConfirmSummaryForm
          projectId={projectId}
          record={record}
          draft={confirmedSummary ?? (draftIsFresh ? draft : null)}
          onDone={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}

function AttachmentChips({
  projectId,
  recordId,
  attachmentIds,
  attachmentsById,
}: {
  projectId: string;
  recordId: string;
  attachmentIds: string[];
  attachmentsById: Map<string, ProjectAttachmentRow>;
}) {
  const [pending, startTransition] = useTransition();
  if (attachmentIds.length === 0) return null;

  function unlink(attachmentId: string) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("evidenceRecordId", recordId);
      fd.set("attachmentId", attachmentId);
      fd.set("projectId", projectId);
      await unlinkEvidenceAttachment(fd);
    });
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {attachmentIds.map((id) => {
        const attachment = attachmentsById.get(id);
        if (!attachment) return null;
        return (
          <li
            key={id}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-muted px-2 py-1 text-xs text-ink-secondary"
          >
            <FileText aria-hidden className="size-3 shrink-0" />
            <span className="max-w-[160px] truncate">{attachment.file_name ?? "파일"}</span>
            <button
              type="button"
              onClick={() => unlink(id)}
              disabled={pending}
              aria-label="연결 해제"
              className="text-ink-muted hover:text-ink"
            >
              <X aria-hidden className="size-3" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function LinkExistingAttachmentForm({
  projectId,
  recordId,
  options,
  onDone,
}: {
  projectId: string;
  recordId: string;
  options: ProjectAttachmentRow[];
  onDone: () => void;
}) {
  const [selected, setSelected] = useState(options[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!selected) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("evidenceRecordId", recordId);
      fd.set("attachmentId", selected);
      fd.set("projectId", projectId);
      const result = await linkExistingAttachment({}, fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      {error ? <Alert className="w-full">{error}</Alert> : null}
      <Select value={selected} onChange={(e) => setSelected(e.target.value)} className="max-w-xs">
        {options.map((a) => (
          <option key={a.id} value={a.id}>
            {a.file_name ?? a.id}
          </option>
        ))}
      </Select>
      <Button type="button" size="sm" onClick={submit} disabled={pending}>
        {pending ? <Spinner className="size-3.5" /> : null}
        연결
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDone}>
        취소
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit (title/body/context)
// ---------------------------------------------------------------------------

function EvidenceRecordEditForm({
  projectId,
  record,
  hasAttachments,
  onDone,
}: {
  projectId: string;
  record: EvidenceRecordRow;
  hasAttachments: boolean;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(record.title);
  const [body, setBody] = useState(record.body ?? "");
  const [occurredAt, setOccurredAt] = useState(record.user_context.occurred_at ?? "");
  const [targetDescription, setTargetDescription] = useState(record.user_context.target_description ?? "");
  const [interviewCount, setInterviewCount] = useState(
    record.user_context.interview_count?.toString() ?? "",
  );
  const [uniqueParticipantCount, setUniqueParticipantCount] = useState(
    record.user_context.unique_participant_count?.toString() ?? "",
  );

  function submit() {
    if (!body.trim() && !hasAttachments) {
      setError("내용을 적거나 파일을 남겨 두어야 해요.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", record.id);
      fd.set("projectId", projectId);
      fd.set("title", title);
      fd.set("body", body);
      fd.set("occurredAt", occurredAt);
      fd.set("targetDescription", targetDescription);
      fd.set("interviewCount", interviewCount);
      fd.set("uniqueParticipantCount", uniqueParticipantCount);
      const result = await updateEvidenceRecord({}, fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  return (
    <div className="space-y-3 rounded-md border border-line-strong bg-surface-muted p-3">
      {error ? <Alert>{error}</Alert> : null}
      <Field label="제목" htmlFor={`edit-title-${record.id}`}>
        <Input id={`edit-title-${record.id}`} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="내용" htmlFor={`edit-body-${record.id}`}>
        <Textarea
          id={`edit-body-${record.id}`}
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="날짜" htmlFor={`edit-occurred-${record.id}`}>
          <Input
            id={`edit-occurred-${record.id}`}
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
        </Field>
        <Field label="대상" htmlFor={`edit-target-${record.id}`}>
          <Input
            id={`edit-target-${record.id}`}
            value={targetDescription}
            onChange={(e) => setTargetDescription(e.target.value)}
          />
        </Field>
        <Field label="인터뷰/응답 횟수" htmlFor={`edit-ic-${record.id}`}>
          <Input
            id={`edit-ic-${record.id}`}
            type="number"
            min={0}
            value={interviewCount}
            onChange={(e) => setInterviewCount(e.target.value)}
          />
        </Field>
        <Field label="고유 참여자 수" htmlFor={`edit-upc-${record.id}`}>
          <Input
            id={`edit-upc-${record.id}`}
            type="number"
            min={0}
            value={uniqueParticipantCount}
            onChange={(e) => setUniqueParticipantCount(e.target.value)}
          />
        </Field>
      </div>
      <p className="text-xs text-ink-muted">
        내용을 바꾸면 이전 AI 정리 결과는 &ldquo;이전 버전&rdquo;으로 표시되고, 다시 정리해야
        최신 내용이 반영돼요.
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={submit} disabled={pending}>
          {pending ? <Spinner className="size-3.5" /> : null}
          저장
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={pending}>
          취소
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI draft / confirmed summary display
// ---------------------------------------------------------------------------

function SummaryView({ draft }: { draft: EvidenceRecordDraftV2 }) {
  return (
    <dl className="space-y-1.5 text-[13px] leading-relaxed text-ink">
      {draft.what ? <SummaryRow label="무엇을">{draft.what}</SummaryRow> : null}
      {draft.when_text ? <SummaryRow label="언제">{draft.when_text}</SummaryRow> : null}
      {draft.who_description ? <SummaryRow label="대상">{draft.who_description}</SummaryRow> : null}
      <SummaryRow label="인터뷰/응답 횟수">
        {draft.interview_count.known ? (draft.interview_count.value ?? "모름") : "자료에서 인원을 확인하지 못했어요"}
      </SummaryRow>
      <SummaryRow label="고유 참여자 수">
        {draft.unique_participant_count.known
          ? (draft.unique_participant_count.value ?? "모름")
          : "자료에서 인원을 확인하지 못했어요"}
      </SummaryRow>
      {draft.purpose ? <SummaryRow label="목적">{draft.purpose}</SummaryRow> : null}
      {draft.key_results.length > 0 ? (
        <SummaryRow label="결과">{draft.key_results.join(" / ")}</SummaryRow>
      ) : null}
      {draft.purchase_signal ? (
        <SummaryRow label="구매 신호">{PURCHASE_SIGNAL_LABEL[draft.purchase_signal]}</SummaryRow>
      ) : null}
      {draft.unknowns.length > 0 ? (
        <SummaryRow label="아직 모르는 점">{draft.unknowns.join(" / ")}</SummaryRow>
      ) : null}
      {draft.duplicate_suspected.suspected ? (
        <SummaryRow label="중복 가능성">
          다른 근거 자료와 같은 내용일 수 있어요{draft.duplicate_suspected.reason ? ` — ${draft.duplicate_suspected.reason}` : ""}
        </SummaryRow>
      ) : null}
      <SummaryRow label="요약">{draft.summary}</SummaryRow>
    </dl>
  );
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[120px_1fr]">
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirm
// ---------------------------------------------------------------------------

function ConfirmSummaryForm({
  projectId,
  record,
  draft,
  onDone,
}: {
  projectId: string;
  record: EvidenceRecordRow;
  draft: EvidenceRecordDraftV2 | null;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [what, setWhat] = useState(draft?.what ?? "");
  const [whenText, setWhenText] = useState(draft?.when_text ?? "");
  const [whoDescription, setWhoDescription] = useState(draft?.who_description ?? "");
  const [interviewKnown, setInterviewKnown] = useState(draft?.interview_count.known ?? false);
  const [interviewValue, setInterviewValue] = useState(draft?.interview_count.value?.toString() ?? "");
  const [participantKnown, setParticipantKnown] = useState(draft?.unique_participant_count.known ?? false);
  const [participantValue, setParticipantValue] = useState(
    draft?.unique_participant_count.value?.toString() ?? "",
  );
  const [purpose, setPurpose] = useState(draft?.purpose ?? "");
  const [keyResults, setKeyResults] = useState(draft?.key_results.join("\n") ?? "");
  const [unknowns, setUnknowns] = useState(draft?.unknowns.join("\n") ?? "");
  const [purchaseSignal, setPurchaseSignal] = useState(draft?.purchase_signal ?? "");
  const [summary, setSummary] = useState(draft?.summary ?? "");

  function submit() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", record.id);
      fd.set("projectId", projectId);
      fd.set("what", what);
      fd.set("whenText", whenText);
      fd.set("whoDescription", whoDescription);
      fd.set("interviewCountKnown", interviewKnown ? "true" : "false");
      fd.set("interviewCountValue", interviewValue);
      fd.set("uniqueParticipantCountKnown", participantKnown ? "true" : "false");
      fd.set("uniqueParticipantCountValue", participantValue);
      fd.set("purpose", purpose);
      fd.set("keyResults", keyResults);
      fd.set("unknowns", unknowns);
      fd.set("purchaseSignal", purchaseSignal);
      fd.set("summary", summary);
      const result = await confirmEvidenceSummary({}, fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  return (
    <div className="space-y-3 rounded-md border border-line-strong bg-surface p-3">
      <p className="text-xs text-ink-secondary">
        AI가 정리한 내용이 맞는지 확인해주세요. 필요하면 고쳐서 저장할 수 있어요. 확인은 창업자가
        맞다고 표시했다는 뜻이며, 객관적으로 검증됐다는 뜻은 아니에요.
      </p>
      {error ? <Alert>{error}</Alert> : null}
      <Field label="무엇을" htmlFor={`c-what-${record.id}`}>
        <Input id={`c-what-${record.id}`} value={what} onChange={(e) => setWhat(e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="언제" htmlFor={`c-when-${record.id}`}>
          <Input id={`c-when-${record.id}`} value={whenText} onChange={(e) => setWhenText(e.target.value)} />
        </Field>
        <Field label="대상" htmlFor={`c-who-${record.id}`}>
          <Input id={`c-who-${record.id}`} value={whoDescription} onChange={(e) => setWhoDescription(e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CountField
          label="인터뷰/응답 횟수"
          known={interviewKnown}
          value={interviewValue}
          onKnownChange={setInterviewKnown}
          onValueChange={setInterviewValue}
          idPrefix={`c-ic-${record.id}`}
        />
        <CountField
          label="고유 참여자 수"
          known={participantKnown}
          value={participantValue}
          onKnownChange={setParticipantKnown}
          onValueChange={setParticipantValue}
          idPrefix={`c-upc-${record.id}`}
        />
      </div>
      <Field label="목적" htmlFor={`c-purpose-${record.id}`}>
        <Textarea id={`c-purpose-${record.id}`} rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
      </Field>
      <Field label="결과 (한 줄에 하나씩)" htmlFor={`c-results-${record.id}`}>
        <Textarea id={`c-results-${record.id}`} rows={3} value={keyResults} onChange={(e) => setKeyResults(e.target.value)} />
      </Field>
      <Field label="아직 모르는 점 (한 줄에 하나씩)" htmlFor={`c-unknowns-${record.id}`}>
        <Textarea id={`c-unknowns-${record.id}`} rows={2} value={unknowns} onChange={(e) => setUnknowns(e.target.value)} />
      </Field>
      <Field label="구매 신호 (해당 시)" htmlFor={`c-signal-${record.id}`}>
        <Select id={`c-signal-${record.id}`} value={purchaseSignal} onChange={(e) => setPurchaseSignal(e.target.value)}>
          <option value="">해당 없음</option>
          <option value="interest">구매 관심</option>
          <option value="intent">구매 의향</option>
          <option value="contract">계약</option>
          <option value="payment">실제 결제</option>
        </Select>
      </Field>
      <Field label="요약" htmlFor={`c-summary-${record.id}`}>
        <Textarea id={`c-summary-${record.id}`} rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </Field>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={submit} disabled={pending}>
          {pending ? <Spinner className="size-3.5" /> : null}
          확인 후 저장
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={pending}>
          취소
        </Button>
      </div>
    </div>
  );
}

function CountField({
  label,
  known,
  value,
  onKnownChange,
  onValueChange,
  idPrefix,
}: {
  label: string;
  known: boolean;
  value: string;
  onKnownChange: (v: boolean) => void;
  onValueChange: (v: string) => void;
  idPrefix: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[13px] font-medium text-ink" htmlFor={idPrefix}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={idPrefix}
          type="number"
          min={0}
          value={value}
          disabled={!known}
          onChange={(e) => onValueChange(e.target.value)}
          className="w-24"
        />
        <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
          <input
            type="checkbox"
            checked={!known}
            onChange={(e) => onKnownChange(!e.target.checked)}
            className="size-3.5"
          />
          자료에서 확인하지 못했어요 (모름)
        </label>
      </div>
    </div>
  );
}
