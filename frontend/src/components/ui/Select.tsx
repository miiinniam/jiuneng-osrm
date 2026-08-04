"use client";

import type { SelectHTMLAttributes } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
}

export default function Select({ error, className = "", children, ...props }: SelectProps) {
  return (
    <div className="w-full">
      <select
        className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-[var(--surface-900)]
          transition-colors duration-150 appearance-none
          bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]
          bg-[length:16px] bg-[right_8px_center] bg-no-repeat pr-10
          ${error
            ? "border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-200"
            : "border-[var(--border)] focus:border-[var(--brand-500)] focus:ring-1 focus:ring-[var(--brand-200)]"
          }
          disabled:bg-[var(--surface-50)] disabled:text-[var(--surface-400)]
          ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
