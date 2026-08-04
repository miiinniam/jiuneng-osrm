"use client";

import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export default function Input({ error, className = "", ...props }: InputProps) {
  return (
    <div className="w-full">
      <input
        className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-[var(--surface-900)]
          placeholder:text-[var(--surface-400)]
          transition-colors duration-150
          ${error
            ? "border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-200"
            : "border-[var(--border)] focus:border-[var(--brand-500)] focus:ring-1 focus:ring-[var(--brand-200)]"
          }
          disabled:bg-[var(--surface-50)] disabled:text-[var(--surface-400)]
          ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
