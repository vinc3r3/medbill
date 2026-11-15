// Runtime validators mirroring lib/types.ts. Used for sample data and AI output.
import { z } from 'zod';
import type { BillDoc, BillLine, Case, EobDoc, EobLine, Flag, Reply } from './types';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const money = z
  .number()
  .finite()
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'expected at most 2 decimals');

export const BillLineSchema = z.object({
  date: isoDate,
  code: z.string().min(1).nullable(),
  description: z.string().min(1),
  billed: money,
});
export const BillDocSchema = z.object({
  provider: z.string().min(1),
  serviceDate: isoDate,
  lines: z.array(BillLineSchema),
  amountDue: money,
});

export const EobLineSchema = z.object({
  date: isoDate,
  code: z.string().min(1).nullable(),
  description: z.string().min(1),
  billed: money,
  allowed: money,
  planPaid: money,
  patientResponsibility: money,
});
export const EobDocSchema = z.object({
  insurer: z.string().min(1),
  claimId: z.string().min(1),
  lines: z.array(EobLineSchema),
  totalPatientResponsibility: money,
});

export const FlagSchema = z.object({
  kind: z.enum(['duplicate', 'over_patient_responsibility', 'not_on_eob', 'eob_says_zero']),
  billLineIdx: z.number().int().nonnegative().nullable(),
  eobLineIdx: z.number().int().nonnegative().nullable(),
  expected: money,
  billed: money,
  difference: money,
  explanation: z.string().min(1),
});

export const ReplySchema = z.object({
  outcome: z.enum(['corrected', 'denied', 'more_info']),
  receivedAt: z.string().min(1),
  bill: BillDocSchema.nullable(),
});

export const CaseSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['uploaded', 'checked', 'letter_ready', 'sent', 'delivered', 'resolved']),
  bill: BillDocSchema,
  eob: EobDocSchema,
  flags: z.array(FlagSchema),
  letter: z.string().nullable(),
  mailLetterId: z.string().nullable(),
  previewUrl: z.string().nullable(),
  sentAt: z.string().nullable(),
  savedAmount: money,
  createdAt: z.string().min(1),
  replies: z.array(ReplySchema),
});

export const SampleExpectedSchema = z.object({
  bill: BillDocSchema,
  eob: EobDocSchema,
  flags: z.array(FlagSchema),
  savedAmount: money,
});

// Compile-time guard: schemas and lib/types.ts must not drift apart.
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
export type _SchemaChecks = [
  Assert<Equals<z.infer<typeof BillLineSchema>, BillLine>>,
  Assert<Equals<z.infer<typeof BillDocSchema>, BillDoc>>,
  Assert<Equals<z.infer<typeof EobLineSchema>, EobLine>>,
  Assert<Equals<z.infer<typeof EobDocSchema>, EobDoc>>,
  Assert<Equals<z.infer<typeof FlagSchema>, Flag>>,
  Assert<Equals<z.infer<typeof ReplySchema>, Reply>>,
  Assert<Equals<z.infer<typeof CaseSchema>, Case>>,
];
