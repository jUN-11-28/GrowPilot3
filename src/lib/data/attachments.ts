import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ProjectAttachmentRow } from "@/lib/types/database";

export async function listAttachments(
  projectId: string,
  userId: string,
): Promise<ProjectAttachmentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_attachments")
    .select("*")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`첨부 자료를 불러오지 못했습니다: ${error.message}`);
  return data ?? [];
}
