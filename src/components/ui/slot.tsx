import {
  Children,
  cloneElement,
  isValidElement,
  type HTMLAttributes,
  type ReactElement,
} from "react";
import { cn } from "@/lib/utils";

type SlotProps = HTMLAttributes<HTMLElement>;

/**
 * Minimal `asChild` implementation: merges props onto the single child element
 * instead of pulling in a headless-UI dependency.
 */
export function Slot({ children, className, ...props }: SlotProps) {
  const child = Children.only(children);
  if (!isValidElement<{ className?: string }>(child)) return null;

  const typed = child as ReactElement<Record<string, unknown>>;
  return cloneElement(typed, {
    ...props,
    ...typed.props,
    className: cn(className, (typed.props.className as string | undefined) ?? ""),
  });
}
