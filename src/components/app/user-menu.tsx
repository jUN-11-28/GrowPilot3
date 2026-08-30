"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import { signOut } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

export function UserMenu({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex max-w-[190px] items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink-secondary transition-colors hover:border-line-strong hover:text-ink"
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 text-ink-muted transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-10"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-line bg-surface p-1 shadow-[0_8px_24px_rgba(17,17,19,0.08)]"
          >
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              disabled={pending}
              onClick={() => startTransition(() => signOut())}
            >
              {pending ? (
                <Spinner className="size-3.5" />
              ) : (
                <LogOut aria-hidden className="size-3.5" />
              )}
              로그아웃
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
