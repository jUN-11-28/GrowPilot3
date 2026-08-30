"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProject } from "@/lib/data/projects";
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  ATTACHMENT_KIND_VALUES,
  MAX_ATTACHMENT_BYTES,
} from "@/lib/domain/constants";
import type { AttachmentKind } from "@/lib/types/database";

export interface AttachmentFormState {
  error?: string;
}

const uploadSchema = z.object({
  projectId: z.uuid(),
  kind: z.enum(ATTACHMENT_KIND_VALUES as [AttachmentKind, ...AttachmentKind[]]),
  note: z.string().trim().max(4000).optional(),
});

/** Storage keeps a filename usable in a path; the display name stays as-is in the DB. */
function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(-100);
}

export async function uploadAttachment(
  _prev: AttachmentFormState,
  formData: FormData,
): Promise<AttachmentFormState> {
  const user = await requireUser();

  const parsed = uploadSchema.safeParse({
    projectId: formData.get("projectId"),
    kind: formData.get("kind"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }

  // Ownership check — a forged projectId cannot attach a file to someone else's project.
  const project = await getProject(parsed.data.projectId, user.id);

  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;

  if (!hasFile && !parsed.data.note) {
    return { error: "파일을 올리거나 메모를 입력해 주세요." };
  }

  const supabase = await createClient();

  let storagePath: string | null = null;
  let fileName: string | null = null;
  let mimeType: string | null = null;
  let byteSize: number | null = null;

  if (hasFile) {
    const uploadedFile = file as File;
    if (uploadedFile.size > MAX_ATTACHMENT_BYTES) {
      return { error: "파일이 너무 큽니다. 15MB 이하로 올려 주세요." };
    }
    if (!(ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(uploadedFile.type)) {
      return { error: "지원하지 않는 파일 형식입니다. PDF, 이미지, 텍스트 파일만 가능합니다." };
    }

    const path = `${user.id}/${project.id}/${crypto.randomUUID()}-${sanitizeFileName(uploadedFile.name)}`;
    const { error: uploadError } = await supabase.storage
      .from("attachments")
      .upload(path, uploadedFile, { contentType: uploadedFile.type });

    if (uploadError) {
      return { error: "파일을 업로드하지 못했습니다. 다시 시도해 주세요." };
    }

    storagePath = path;
    fileName = uploadedFile.name;
    mimeType = uploadedFile.type;
    byteSize = uploadedFile.size;
  }

  const { error: insertError } = await supabase.from("project_attachments").insert({
    project_id: project.id,
    user_id: user.id,
    kind: parsed.data.kind,
    note: parsed.data.note || null,
    file_name: fileName,
    mime_type: mimeType,
    storage_path: storagePath,
    byte_size: byteSize,
  });

  if (insertError) {
    if (storagePath) await supabase.storage.from("attachments").remove([storagePath]);
    return { error: "첨부 자료를 저장하지 못했습니다. 다시 시도해 주세요." };
  }

  revalidatePath(`/projects/${project.id}`);
  return {};
}

export async function deleteAttachment(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  if (!id || !projectId) return;

  const supabase = await createClient();
  const { data: attachment } = await supabase
    .from("project_attachments")
    .select("storage_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!attachment) return;

  if (attachment.storage_path) {
    await supabase.storage.from("attachments").remove([attachment.storage_path]);
  }

  await supabase.from("project_attachments").delete().eq("id", id).eq("user_id", user.id);

  revalidatePath(`/projects/${projectId}`);
}
