import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Handles the email-confirmation / magic-link redirect. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(
        new URL(next.startsWith("/") ? next : "/dashboard", origin),
      );
    }
  }

  return NextResponse.redirect(
    new URL("/login?error=auth_callback_failed", origin),
  );
}
