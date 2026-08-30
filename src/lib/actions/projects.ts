"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  EVIDENCE_VALUES,
  PROJECT_STAGE_VALUES,
} from "@/lib/domain/constants";
import type { EvidenceType, ProjectStage } from "@/lib/types/database";

export interface ProjectFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const projectSchema = z.object({
  name: z.string().trim().min(1, "프로젝트명을 입력해 주세요.").max(120),
  problem: z.string().trim().min(10, "해결하려는 문제를 조금 더 구체적으로 적어 주세요.").max(4000),
  target_customer: z.string().trim().min(5, "타깃 고객을 입력해 주세요.").max(2000),
  solution: z.string().trim().min(10, "해결 방법을 조금 더 구체적으로 적어 주세요.").max(4000),
  stage: z.enum(PROJECT_STAGE_VALUES as [ProjectStage, ...ProjectStage[]]),
  evidence: z
    .array(z.enum(EVIDENCE_VALUES as [EvidenceType, ...EvidenceType[]]))
    .default([]),
});

function toFieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    result[key] ??= issue.message;
  }
  return result;
}

export async function createProject(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const user = await requireUser();

  const evidence = formData.getAll("evidence").map(String);
  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    problem: formData.get("problem"),
    target_customer: formData.get("target_customer"),
    solution: formData.get("solution"),
    stage: formData.get("stage"),
    // "아직 없음"은 다른 항목과 함께 선택될 수 없다.
    evidence: evidence.includes("none") ? ["none"] : evidence,
  });

  if (!parsed.success) {
    return { error: "입력값을 확인해 주세요.", fieldErrors: toFieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ ...parsed.data, user_id: user.id })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "프로젝트를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/dashboard");
  redirect(`/projects/${data.id}`);
}

export async function deleteProject(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", user.id);

  if (error) throw new Error(`프로젝트를 삭제하지 못했습니다: ${error.message}`);

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
