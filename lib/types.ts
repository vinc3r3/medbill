// Shared types. Must match docs/spec.md exactly.

export type BillLine = { date: string; code: string | null; description: string; billed: number };
export type BillDoc = { provider: string; serviceDate: string; lines: BillLine[]; amountDue: number };

export type EobLine = {
  date: string; code: string | null; description: string;
  billed: number; allowed: number; planPaid: number; patientResponsibility: number;
};
export type EobDoc = { insurer: string; claimId: string; lines: EobLine[]; totalPatientResponsibility: number };

export type FlagKind = 'duplicate' | 'over_patient_responsibility' | 'not_on_eob' | 'eob_says_zero';
export type Flag = {
  kind: FlagKind;
  billLineIdx: number | null;
  eobLineIdx: number | null;
  expected: number;     // what the patient should owe for this item
  billed: number;       // what the bill asks for
  difference: number;   // billed - expected
  explanation: string;  // plain language, phrased as a question to verify
};

export type CaseStatus = 'uploaded' | 'checked' | 'letter_ready' | 'sent' | 'delivered' | 'resolved';
export type Case = {
  id: string; status: CaseStatus; bill: BillDoc; eob: EobDoc; flags: Flag[];
  letter: string | null; mailLetterId: string | null; previewUrl: string | null; sentAt: string | null;
  savedAmount: number; createdAt: string;
};
