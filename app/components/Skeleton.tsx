/** Placeholder blocks shown while a page streams in. Announced once to screen readers. */
function Bar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-line/70 ${className}`} />;
}

function Shell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" data-testid="loading" className="flex flex-col gap-6">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <Shell label="Loading your cases…">
      <Bar className="h-10 w-48" />
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[0, 1, 2].map((i) => <Bar key={i} className="h-20 sm:h-28" />)}
      </div>
      <Bar className="h-48" />
    </Shell>
  );
}

export function CaseSkeleton() {
  return (
    <Shell label="Loading your case…">
      <Bar className="h-4 w-24" />
      <Bar className="h-8 w-64 max-w-full" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Bar className="h-32" />
        <Bar className="h-56" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Bar className="h-48" />
        <Bar className="h-48" />
      </div>
    </Shell>
  );
}

export function FormSkeleton() {
  return (
    <Shell label="Loading…">
      <Bar className="h-16" />
      <Bar className="h-56" />
    </Shell>
  );
}
