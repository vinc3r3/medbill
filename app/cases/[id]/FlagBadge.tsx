/** Numbered marker linking a flag card to the table rows it refers to. */
export function FlagBadge({ n }: { n: number }) {
  return (
    <span
      aria-label={`Item ${n}`}
      className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white"
    >
      {n}
    </span>
  );
}
