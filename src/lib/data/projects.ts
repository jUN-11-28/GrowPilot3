import "server-only";

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProjectRow } from "@/lib/types/database";

export async function listProjects(userId: string): Promise<ProjectRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`프로젝트를 불러오지 못했습니다: ${error.message}`);
  return data ?? [];
}

/** Same query as {@link getProject} but returns null instead of 404-ing. */
export async function findProject(
  projectId: string,
  userId: string,
): Promise<ProjectRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`프로젝트를 불러오지 못했습니다: ${error.message}`);
  return data;
}

/**
 * RLS already scopes this to the owner; the explicit user_id filter is the
 * second, server-side ownership check the app never skips.
 */
export async function getProject(
  projectId: string,
  userId: string,
): Promise<ProjectRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`프로젝트를 불러오지 못했습니다: ${error.message}`);
  if (!data) notFound();
  return data;
}
