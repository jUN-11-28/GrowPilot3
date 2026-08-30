import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Image
        src="/logo.png"
        alt=""
        aria-hidden
        width={24}
        height={24}
        className="size-6 object-contain"
      />
      <span className="text-[15px] font-semibold tracking-tight text-ink">
        GrowPilot
      </span>
    </span>
  );
}
