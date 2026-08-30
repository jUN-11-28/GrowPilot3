import { Slot } from "@/components/ui/slot";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-ink text-ink-inverse hover:bg-ink/90 disabled:bg-ink/40 shadow-[0_1px_2px_rgba(17,17,19,0.16)]",
  secondary:
    "bg-surface text-ink border border-line hover:bg-surface-muted hover:border-line-strong",
  ghost: "bg-transparent text-ink-secondary hover:bg-surface-muted hover:text-ink",
  danger: "bg-danger text-white hover:bg-danger/90",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] rounded-md gap-1.5",
  md: "h-10 px-4 text-sm rounded-md gap-2",
  lg: "h-11 px-5 text-[15px] rounded-lg gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  asChild = false,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      // `asChild` renders a Link, which must not receive a `type` attribute.
      {...(asChild ? {} : { type: type ?? "button" })}
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-colors",
        "disabled:pointer-events-none disabled:opacity-60",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
