interface SkeletonProps {
  className?: string;
}

export default function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`animate-pulse rounded-lg bg-[var(--surface-200)] ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="space-y-4 rounded-xl border border-[var(--border)] bg-white p-4">
      <Skeleton className="h-8 w-2/3" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-6" />
        <Skeleton className="h-6" />
        <Skeleton className="h-6" />
        <Skeleton className="h-6" />
      </div>
      <div className="border-t border-[var(--border)] pt-3">
        <Skeleton className="mb-2 h-4 w-1/3" />
        <Skeleton className="mb-1 h-5" />
        <Skeleton className="mb-1 h-5" />
        <Skeleton className="h-5 w-2/3" />
      </div>
    </div>
  );
}
