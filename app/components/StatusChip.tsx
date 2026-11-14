import { STATUS_LABELS } from '@/lib/dashboard';
import type { CaseStatus } from '@/lib/types';

const STYLES: Record<CaseStatus, string> = {
  uploaded: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  checked: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100',
  letter_ready: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100',
  sent: 'bg-blue-100 text-blue-900 dark:bg-blue-900/50 dark:text-blue-100',
  delivered: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/50 dark:text-indigo-100',
  resolved: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100',
};

export function StatusChip({ status }: { status: CaseStatus }) {
  return (
    <span data-status={status} className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
