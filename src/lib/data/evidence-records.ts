import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  EvidenceRecordAttachmentRow,
  EvidenceRecordRow,
  EvidenceRecordType,
} from "@/lib/types/database";

export async function listEvidenceRecords(
  projectId: string,
  userId: string,
): Promise<EvidenceRecordRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("evidence_records")
    .select("*")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`근거 자료를 불러오지 못했습니다: ${error.message}`);
  return data ?? [];
}

export async function getEvidenceRecord(
  id: string,
  userId: string,
): Promise<EvidenceRecordRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("evidence_records")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`근거 자료를 불러오지 못했습니다: ${error.message}`);
  return data;
}

/**
 * All links for every evidence record in a project.
 *
 * Two queries rather than one embedded join: the hand-maintained
 * `Database` type (types/database.ts) declares `Relationships: []` on every
 * table, so a PostgREST embedded-resource select (`evidence_records!inner(...)`)
 * cannot be typed against it safely.
 */
export async function listEvidenceRecordAttachmentLinks(
  projectId: string,
  userId: string,
): Promise<EvidenceRecordAttachmentRow[]> {
  const records = await listEvidenceRecords(projectId, userId);
  if (records.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("evidence_record_attachments")
    .select("*")
    .eq("user_id", userId)
    .in(
      "evidence_record_id",
      records.map((r) => r.id),
    );

  if (error) throw new Error(`근거 자료의 첨부 연결을 불러오지 못했습니다: ${error.message}`);
  return data ?? [];
}

/** How many evidence records currently exist per evidence type — used to guard against silently deleting evidence by unselecting a type. */
export async function countEvidenceRecordsByType(
  projectId: string,
  userId: string,
): Promise<Partial<Record<EvidenceRecordType, number>>> {
  const rows = await listEvidenceRecords(projectId, userId);
  const counts: Partial<Record<EvidenceRecordType, number>> = {};
  for (const row of rows) {
    counts[row.evidence_type] = (counts[row.evidence_type] ?? 0) + 1;
  }
  return counts;
}

/** Attachments not currently linked to any evidence record — candidates for "기존 자료를 새 Evidence 종류에 연결". */
export async function listUnlinkedAttachments(projectId: string, userId: string) {
  const supabase = await createClient();
  const { data: attachments, error } = await supabase
    .from("project_attachments")
    .select("*")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`첨부 자료를 불러오지 못했습니다: ${error.message}`);

  const links = await listEvidenceRecordAttachmentLinks(projectId, userId);
  const linkedIds = new Set(links.map((l) => l.attachment_id));
  return (attachments ?? []).filter((a) => !linkedIds.has(a.id));
}
