import "server-only";

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProject } from "@/lib/data/projects";
import type {
  DiagnosisAnswerRow,
  DiagnosisResultRow,
  DiagnosisSessionRow,
  ProjectRow,
  ResourceRow,
} from "@/lib/types/database";

export interface SessionBundle {
  session: DiagnosisSessionRow;
  project: ProjectRow;
  answers: DiagnosisAnswerRow[];
}

export async function getSession(
  sessionId: string,
  userId: string,
): Promise<DiagnosisSessionRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("diagnosis_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`진단 세션을 불러오지 못했습니다: ${error.message}`);
  if (!data) notFound();
  return data;
}

export async function listAnswers(
  sessionId: string,
  userId: string,
): Promise<DiagnosisAnswerRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("diagnosis_answers")
    .select("*")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .order("order_index", { ascending: true });

  if (error) throw new Error(`진단 답변을 불러오지 못했습니다: ${error.message}`);
  return data ?? [];
}

export async function getSessionBundle(
  sessionId: string,
  userId: string,
): Promise<SessionBundle> {
  const session = await getSession(sessionId, userId);
  const [project, answers] = await Promise.all([
    getProject(session.project_id, userId),
    listAnswers(sessionId, userId),
  ]);
  return { session, project, answers };
}

export async function listSessions(
  projectId: string,
  userId: string,
): Promise<DiagnosisSessionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("diagnosis_sessions")
    .select("*")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`진단 기록을 불러오지 못했습니다: ${error.message}`);
  return data ?? [];
}

export async function getResult(
  sessionId: string,
  userId: string,
): Promise<DiagnosisResultRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("diagnosis_results")
    .select("*")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`진단 결과를 불러오지 못했습니다: ${error.message}`);
  return data;
}

export async function listResources(ids?: string[]): Promise<ResourceRow[]> {
  const supabase = await createClient();
  let query = supabase.from("resources").select("*");
  if (ids) {
    if (ids.length === 0) return [];
    query = query.in("id", ids);
  }
  const { data, error } = await query.order("created_at", { ascending: true });

  if (error) throw new Error(`리소스를 불러오지 못했습니다: ${error.message}`);
  return data ?? [];
}

export async function listResultsByProject(
  projectId: string,
  userId: string,
): Promise<DiagnosisResultRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("diagnosis_results")
    .select("*")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`진단 결과를 불러오지 못했습니다: ${error.message}`);
  return data ?? [];
}
