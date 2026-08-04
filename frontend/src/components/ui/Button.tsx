"use client";

import { type ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  size?: "sm" | "md" | "lg";
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--brand-600)] text-white hover:bg-[var(--brand-700)] shadow-sm hover:shadow-md active:scale-[0.98]",
  secondary:
    "bg-[var(--surface-800)] text-white hover:bg-[var(--surface-700)] shadow-sm",
  ghost:
    "bg-transparent text-[var(--surface-600)] hover:bg-[var(--surface-100)]",
  danger:
    "bg-[var(--danger)] text-white hover:bg-red-700 shadow-sm",
  outline:
    "border border-[var(--border)] bg-white text-[var(--surface-700)] hover:bg-[var(--surface-50)] hover:border-[var(--border-hover)]",
};

const sizeClasses: Record<string, string> = {
  sm: "px-2.5 py-1 text-xs rounded-md",
  md: "px-4 py-2 text-sm rounded-lg",
  lg: "px-6 py-2.5 text-base rounded-lg",
};

export default function Button({
  variant = "primary",
  loading = false,
  size = "md",
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 font-medium transition-all duration-150
        disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100
        ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {loading && (
        <svg
          className="h-4 w-4 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
