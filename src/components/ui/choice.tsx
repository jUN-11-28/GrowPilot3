"use client";

import { cn } from "@/lib/utils";

interface ChoiceProps {
  name: string;
  value: string;
  label: string;
  description?: string;
  type: "radio" | "checkbox";
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (value: string, checked: boolean) => void;
}

/**
 * Bordered option row used for stage / evidence selection. Keeps the native
 * input so form submission and keyboard behaviour stay intact.
 */
export function Choice({
  name,
  value,
  label,
  description,
  type,
  checked,
  defaultChecked,
  onChange,
}: ChoiceProps) {
  return (
    <label
      className={cn(
        "group flex cursor-pointer items-start gap-3 rounded-md border px-4 py-3 transition-colors",
        checked
          ? "border-ink bg-surface-muted"
          : "border-line bg-surface hover:border-line-strong",
      )}
    >
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={(event) => onChange?.(value, event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[color:var(--color-ink)]"
      />
      <span className="space-y-1">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {description ? (
          <span className="block text-xs leading-relaxed text-ink-secondary">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}
