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
import { ExecutionConstraintsSchema, TechnicalContextSchema } from "@/lib/ai/schemas-v2";
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

/** Builds the v2 technical_context/execution_constraints pair from raw FormData — used by both create and the later edit-in-place panel. */
function parseContextFields(formData: FormData) {
  const hardConstraints = String(formData.get("hard_constraints") ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return {
    technicalContext: TechnicalContextSchema.safeParse({
      technology_type: optionalText(formData.get("technology_type")),
      business_model: optionalText(formData.get("business_model")),
      user_role: optionalText(formData.get("user_role")),
      buyer_role: optionalText(formData.get("buyer_role")),
      technical_maturity: optionalText(formData.get("technical_maturity")),
      sales_cycle_days: optionalNumber(formData.get("sales_cycle_days")),
      usage_cycle_days: optionalNumber(formData.get("usage_cycle_days")),
    }),
    executionConstraints: ExecutionConstraintsSchema.safeParse({
      hours_per_week: optionalNumber(formData.get("hours_per_week")),
      budget_amount: optionalNumber(formData.get("budget_amount")),
      budget_currency: optionalText(formData.get("budget_currency")),
      customer_access: optionalText(formData.get("customer_access")),
      test_environment_access: optionalText(formData.get("test_environment_access")),
      hard_constraints: hardConstraints,
    }),
  };
}

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

  const { technicalContext, executionConstraints } = parseContextFields(formData);
  if (!technicalContext.success || !executionConstraints.success) {
    return { error: "기술·실행 정보 입력값을 확인해 주세요." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      ...parsed.data,
      user_id: user.id,
      technical_context: technicalContext.data,
      execution_constraints: executionConstraints.data,
    })
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

export interface ProjectContextFormState {
  error?: string;
}

/** Empty input means "not answered" (null), never 0 or the empty string — an unanswered number field is not the same claim as "0". */
function optionalNumber(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const trimmed = String(value).trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function optionalText(value: FormDataEntryValue | null): string | null {
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * v2 — lets a founder add or edit technical/execution context on an existing
 * project without a full project-edit feature. Every field is optional: an
 * untouched field stays/returns null, it is never coerced to 0 or "".
 */
export async function updateProjectContext(
  _prev: ProjectContextFormState,
  formData: FormData,
): Promise<ProjectContextFormState> {
  const user = await requireUser();
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) return { error: "프로젝트를 찾을 수 없습니다." };

  const { technicalContext, executionConstraints } = parseContextFields(formData);
  if (!technicalContext.success || !executionConstraints.success) {
    return { error: "입력값을 확인해 주세요." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({
      technical_context: technicalContext.data,
      execution_constraints: executionConstraints.data,
    })
    .eq("id", projectId)
    .eq("user_id", user.id);

  if (error) {
    return { error: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath(`/projects/${projectId}`);
  return {};
}
