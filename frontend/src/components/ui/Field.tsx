interface FieldProps {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export default function Field({ label, hint, required, children, className = "" }: FieldProps) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--surface-500)] uppercase tracking-wide">
        {label}
        {required && <span className="text-red-400">*</span>}
      </span>
      {children}
      {hint && <p className="text-xs text-[var(--surface-400)]">{hint}</p>}
    </label>
  );
}
