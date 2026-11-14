// Case tracking rules. Pure.
import type { CaseStatus } from './types';

/**
 * The case status a mail-provider letter status leads to, or null for "no change". Only a `sent` case moves
 * (to `delivered` when the letter is `completed`); cases never move backwards.
 */
export function caseStatusForLetter(current: CaseStatus, letterStatus: string): CaseStatus | null {
  return current === 'sent' && letterStatus === 'completed' ? 'delivered' : null;
}

export const REMINDER_DAYS = 30;

/** Follow-up date (YYYY-MM-DD, UTC) = sent date + 30 days. */
export function reminderDate(sentAt: string | null): string | null {
  if (!sentAt) return null;
  const d = new Date(sentAt);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + REMINDER_DAYS);
  return d.toISOString().slice(0, 10);
}

/** True once the follow-up day has arrived and the case isn't resolved. */
export function isReminderDue(sentAt: string | null, status: CaseStatus, now = new Date()): boolean {
  const due = reminderDate(sentAt);
  return Boolean(due) && status !== 'resolved' && now.toISOString().slice(0, 10) >= due!;
}
