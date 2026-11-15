import type { ReactNode } from 'react';
import { formatUsd, formatUsDate } from '@/lib/format';
import type { BillDoc, EobDoc } from '@/lib/types';
import { FlagBadge } from './FlagBadge';

const FLAGGED_ROW = 'bg-amber-100 dark:bg-amber-900/40';

function Badges({ ns }: { ns?: number[] }) {
  if (!ns?.length) return null;
  return (
    <span className="ml-1 inline-flex gap-1 align-middle">
      {ns.map((n) => (
        <FlagBadge key={n} n={n} />
      ))}
    </span>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">{children}</div>
    </div>
  );
}

const th = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted';
const td = 'px-3 py-2 align-top';
const num = 'text-right whitespace-nowrap tabular-nums';
// Secondary EOB columns: hidden on phones so "You owe" always fits on screen.
const wideOnly = 'hidden sm:table-cell';

export function BillTable({ bill, marks, totalsMarks }: { bill: BillDoc; marks: Map<number, number[]>; totalsMarks: number[] }) {
  return (
    <Panel title="Your bill">
      <table className="w-full text-sm" data-testid="bill-table">
        <thead className="border-b border-line">
          <tr>
            <th className={th}>Date</th>
            <th className={th}>Service</th>
            <th className={`${th} ${num}`}>You&apos;re asked to pay</th>
          </tr>
        </thead>
        <tbody>
          {bill.lines.map((l, i) => (
            <tr key={i} data-flagged={marks.has(i) || undefined} className={`border-b border-neutral-200 dark:border-neutral-800 ${marks.has(i) ? FLAGGED_ROW : ''}`}>
              <td className={`${td} whitespace-nowrap`}>{formatUsDate(l.date)}</td>
              <td className={td}>
                {l.description}
                {l.code && <span className="block text-xs text-neutral-500">Code {l.code}</span>}
              </td>
              <td className={`${td} ${num}`}>
                {formatUsd(l.billed)}
                <Badges ns={marks.get(i)} />
              </td>
            </tr>
          ))}
          <tr data-flagged={totalsMarks.length > 0 || undefined} className={`font-semibold ${totalsMarks.length ? FLAGGED_ROW : ''}`}>
            <td className={td} colSpan={2}>
              Amount due
            </td>
            <td className={`${td} ${num}`}>
              {formatUsd(bill.amountDue)}
              <Badges ns={totalsMarks} />
            </td>
          </tr>
        </tbody>
      </table>
    </Panel>
  );
}

export function EobTable({ eob, marks, totalsMarks }: { eob: EobDoc; marks: Map<number, number[]>; totalsMarks: number[] }) {
  return (
    <Panel title="Your EOB (from your insurer)">
      <table className="w-full text-sm" data-testid="eob-table">
        <thead className="border-b border-line">
          <tr>
            <th className={th}>Date</th>
            <th className={th}>Service</th>
            <th className={`${th} ${num} ${wideOnly}`}>Allowed</th>
            <th className={`${th} ${num} ${wideOnly}`}>Plan paid</th>
            <th className={`${th} ${num}`}>You owe</th>
          </tr>
        </thead>
        <tbody>
          {eob.lines.map((l, i) => (
            <tr key={i} data-flagged={marks.has(i) || undefined} className={`border-b border-neutral-200 dark:border-neutral-800 ${marks.has(i) ? FLAGGED_ROW : ''}`}>
              <td className={`${td} whitespace-nowrap`}>{formatUsDate(l.date)}</td>
              <td className={td}>
                {l.description}
                <span className="block text-xs text-neutral-500">
                  {l.code ? `Code ${l.code} · ` : ''}Billed {formatUsd(l.billed)}
                  <span className="sm:hidden">
                    {' '}
                    · Plan paid {formatUsd(l.planPaid)}
                  </span>
                </span>
              </td>
              <td className={`${td} ${num} ${wideOnly}`}>{formatUsd(l.allowed)}</td>
              <td className={`${td} ${num} ${wideOnly}`}>{formatUsd(l.planPaid)}</td>
              <td className={`${td} ${num} font-medium`}>
                {formatUsd(l.patientResponsibility)}
                <Badges ns={marks.get(i)} />
              </td>
            </tr>
          ))}
          <tr data-flagged={totalsMarks.length > 0 || undefined} className={`font-semibold ${totalsMarks.length ? FLAGGED_ROW : ''}`}>
            <td className={td} colSpan={2}>
              Your total responsibility
            </td>
            <td className={wideOnly} colSpan={2} />
            <td className={`${td} ${num}`}>
              {formatUsd(eob.totalPatientResponsibility)}
              <Badges ns={totalsMarks} />
            </td>
          </tr>
        </tbody>
      </table>
    </Panel>
  );
}
