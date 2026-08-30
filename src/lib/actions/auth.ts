"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface AuthFormState {
  error?: string;
  notice?: string;
}

const credentials = z.object({
  email: z.email({ message: "올바른 이메일을 입력해 주세요." }),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다."),
});

const signUpSchema = credentials.extend({
  displayName: z.string().trim().max(60).optional(),
});

function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "입력값을 확인해 주세요.";
}

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  const redirectTo = String(formData.get("redirectTo") || "/dashboard");
  revalidatePath("/", "layout");
  redirect(redirectTo.startsWith("/") ? redirectTo : "/dashboard");
}

export async function signUp(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName") || undefined,
  });
  if (!parsed.success) return { error: firstError(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName ?? null },
    },
  });

  if (error) {
    return {
      error:
        error.status === 422
          ? "이미 가입된 이메일입니다."
          : "가입에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  // Email confirmation on: no session is returned until the link is clicked.
  if (!data.session) {
    return {
      notice: `${parsed.data.email} 으로 인증 메일을 보냈습니다. 메일의 링크를 눌러 가입을 완료해 주세요.`,
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
