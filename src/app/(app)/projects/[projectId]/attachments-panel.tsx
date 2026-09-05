"use client";

import { FileText, Trash2, Upload } from "lucide-react";
import { useActionState, useEffect, useRef, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Alert, Spinner } from "@/components/ui/feedback";
import {
  deleteAttachment,
  uploadAttachment,
  type AttachmentFormState,
} from "@/lib/actions/attachments";
import { ATTACHMENT_KIND_LABEL, ATTACHMENT_KINDS } from "@/lib/domain/constants";
import { formatDate } from "@/lib/utils";
import type { ProjectAttachmentRow } from "@/lib/types/database";

export function AttachmentsPanel({
  projectId,
  attachments,
}: {
  projectId: string;
  attachments: ProjectAttachmentRow[];
}) {
  const [state, action, pending] = useActionState<AttachmentFormState, FormData>(
    uploadAttachment,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      formRef.current?.reset();
    }
    wasPending.current = pending;
  }, [pending, state.error]);

  return (
    <div className="space-y-5">
      {attachments.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-ink-secondary">
          아직 첨부한 자료가 없습니다. 사업기획서, 재무제표, 고민되는 점을 파일이나 사진으로
          올려두면 다음 진단에서 근거로 반영됩니다.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
          {attachments.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-4 px-4 py-3">
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{ATTACHMENT_KIND_LABEL[item.kind]}</Badge>
                  {item.file_name ? (
                    <span className="inline-flex items-center gap-1 truncate text-[13px] text-ink">
                      <FileText aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
                      {item.file_name}
                    </span>
                  ) : null}
                </div>
                {item.note ? (
                  <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink-secondary">
                    {item.note}
                  </p>
                ) : null}
                <p className="text-xs text-ink-muted">{formatDate(item.created_at)}</p>
              </div>
              <DeleteAttachmentButton id={item.id} projectId={projectId} />
            </li>
          ))}
        </ul>
      )}

      <form
        ref={formRef}
        action={action}
        className="space-y-4 rounded-lg border border-dashed border-line-strong p-4"
      >
        <input type="hidden" name="projectId" value={projectId} />
        {state.error ? <Alert>{state.error}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <Field label="분류" htmlFor="kind">
            <Select id="kind" name="kind" defaultValue="business_plan">
              {ATTACHMENT_KINDS.filter((option) => option.value !== "evidence").map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="파일 (선택)" htmlFor="file" hint="PDF, 이미지, 텍스트 · 15MB 이하">
            <input
              id="file"
              name="file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.txt,.csv"
              className="block w-full text-[13px] text-ink-secondary file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-ink hover:file:bg-surface-muted"
            />
          </Field>
        </div>
        <Field label="메모 (선택)" htmlFor="note" hint="파일 없이 텍스트만 남겨도 됩니다">
          <Textarea
            id="note"
            name="note"
            rows={2}
            placeholder="예: 지난달 대비 재구매율이 떨어진 게 고민입니다."
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? <Spinner className="size-3.5" /> : <Upload aria-hidden className="size-3.5" />}
          {pending ? "업로드 중" : "첨부하기"}
        </Button>
      </form>
    </div>
  );
}

function DeleteAttachmentButton({ id, projectId }: { id: string; projectId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        const formData = new FormData();
        formData.set("id", id);
        formData.set("projectId", projectId);
        startTransition(() => deleteAttachment(formData));
      }}
    >
      {pending ? <Spinner className="size-3.5" /> : <Trash2 aria-hidden className="size-3.5" />}
    </Button>
  );
}
