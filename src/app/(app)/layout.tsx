import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/app/logo";
import { UserMenu } from "@/components/app/user-menu";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" aria-label="대시보드">
              <Logo />
            </Link>
            <nav className="hidden text-[13px] text-ink-secondary sm:block">
              <Link
                href="/dashboard"
                className="rounded-md px-2 py-1 transition-colors hover:bg-surface-muted hover:text-ink"
              >
                프로젝트
              </Link>
            </nav>
          </div>
          <UserMenu
            label={profile?.display_name || profile?.email || user.email || "계정"}
          />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
