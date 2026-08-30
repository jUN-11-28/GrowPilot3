import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/app/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-6 py-6">
        <Link href="/" aria-label="GrowPilot 홈">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-6 pb-20 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  );
}
