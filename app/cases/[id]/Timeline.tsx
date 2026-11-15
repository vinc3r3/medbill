import type { Step, StepState } from '@/lib/timeline';

const fmt = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

const DOT: Record<StepState, string> = {
  done: 'border-emerald-600 bg-emerald-600 text-white',
  current: 'border-brand bg-surface text-brand',
  attention: 'border-amber-500 bg-amber-500 text-white',
  upcoming: 'border-line bg-surface text-muted',
};

function Icon({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <svg aria-hidden viewBox="0 0 20 20" className="size-3.5" fill="currentColor">
        <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
      </svg>
    );
  }
  if (state === 'attention') return <span aria-hidden className="text-xs font-bold">!</span>;
  if (state === 'current') return <span aria-hidden className="size-2 rounded-full bg-brand" />;
  return null;
}

const STATE_TEXT: Record<StepState, string> = { done: 'done', current: 'in progress', attention: 'needs attention', upcoming: 'not yet' };

/** Vertical tracking timeline: check → letter → delivery → replies → resolved. */
export function Timeline({ steps }: { steps: Step[] }) {
  return (
    <section aria-label="Tracking" data-testid="timeline" className="card flex flex-col gap-3">
      <h2 className="font-semibold">Tracking</h2>
      <ol className="flex flex-col">
        {steps.map((s, i) => (
          <li key={s.key} data-step={s.key} data-state={s.state} className="relative flex gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 && (
              <span aria-hidden className={`absolute top-6 left-[11px] h-[calc(100%-1.5rem)] w-0.5 ${s.state === 'done' ? 'bg-emerald-600' : 'bg-line'}`} />
            )}
            <span className={`z-[1] flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${DOT[s.state]}`}>
              <Icon state={s.state} />
            </span>
            <div className="flex min-w-0 flex-col">
              <p className={`text-sm ${s.state === 'upcoming' ? 'text-muted' : 'font-medium'}`}>
                {s.label}
                <span className="sr-only"> ({STATE_TEXT[s.state]})</span>
              </p>
              {(s.date || s.detail) && (
                <p className={`text-xs ${s.state === 'attention' ? 'font-semibold text-amber-800 dark:text-amber-300' : 'text-muted'}`}>
                  {s.date ? fmt(s.date) : ''}
                  {s.date && s.detail ? ' · ' : ''}
                  {s.detail}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
