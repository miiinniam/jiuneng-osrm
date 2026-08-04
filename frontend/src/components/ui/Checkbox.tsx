"use client";

import type { InputHTMLAttributes } from "react";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  description?: string;
}

export default function Checkbox({ label, description, className = "", id, ...props }: CheckboxProps) {
  const checkboxId = id || `cb-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className={`flex items-start gap-2.5 ${className}`}>
      <input
        id={checkboxId}
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--border)]
          text-[var(--brand-600)] transition-colors
          focus:ring-2 focus:ring-[var(--brand-200)] focus:ring-offset-0
          accent-[var(--brand-600)]"
        {...props}
      />
      <label htmlFor={checkboxId} className="cursor-pointer text-sm text-[var(--surface-700)] select-none">
        {label}
        {description && <span className="mt-0.5 block text-xs text-[var(--surface-400)]">{description}</span>}
      </label>
    </div>
  );
}
