'use client';

import { useMemo, useState } from 'react';
import { useProfile } from '@/app/hooks/useProfile';
import { isProfileEmpty } from '@/lib/profile';
import { redact } from '@/lib/redact';
import { DropZone } from './DropZone';
import { OcrDebugPanel } from './OcrDebugPanel';
import { RedactedView } from './RedactedView';

type OcrState =
  | { kind: 'idle' }
  | { kind: 'reading'; label: string; percent: number }
  | { kind: 'done'; billText: string; eobText: string }
  | { kind: 'error'; message: string };

const DOC_LABELS = ['bill', 'EOB'];

export function UploadForm() {
  const [bill, setBill] = useState<File | null>(null);
  const [eob, setEob] = useState<File | null>(null);
  const [ocr, setOcr] = useState<OcrState>({ kind: 'idle' });
  const reading = ocr.kind === 'reading';
  const ready = bill !== null && eob !== null && !reading;
  const profile = useProfile();

  // Redacted text is derived, so it updates as soon as the profile is saved or changed.
  const redacted = useMemo(
    () => (ocr.kind === 'done' ? { bill: redact(ocr.billText, profile), eob: redact(ocr.eobText, profile) } : null),
    [ocr, profile],
  );

  // Changing a document invalidates the text read from the old one.
  const resetOcr = () => setOcr({ kind: 'idle' });

  async function readDocuments(billFile: File, eobFile: File) {
    setOcr({ kind: 'reading', label: 'Getting ready', percent: 0 });
    try {
      // Loaded on demand so the OCR library never ships with the first page load.
      const { ocrImages } = await import('@/lib/ocr');
      const [billText, eobText] = await ocrImages([billFile, eobFile], ({ index, status, progress }) => {
        const label = status === 'recognizing text' ? `Reading your ${DOC_LABELS[index] ?? 'document'}` : 'Getting ready';
        setOcr({ kind: 'reading', label, percent: Math.round(progress * 100) });
      });
      setOcr({ kind: 'done', billText, eobText });
    } catch (err) {
      console.error(err);
      setOcr({ kind: 'error', message: "We couldn't read the text in these images. Try clearer photos or scans, then check again." });
    }
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (bill && eob) void readDocuments(bill, eob);
      }}
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <DropZone
          label="Bill"
          hint="The statement from your doctor or hospital"
          file={bill}
          onChange={(f) => {
            setBill(f);
            resetOcr();
          }}
        />
        <DropZone
          label="EOB"
          hint="The Explanation of Benefits from your insurer"
          file={eob}
          onChange={(f) => {
            setEob(f);
            resetOcr();
          }}
        />
      </div>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Your documents stay on this device. Text is read here, and personal details are removed before anything is
        sent.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={!ready}
          className="rounded-lg bg-blue-700 px-5 py-2.5 font-medium text-white disabled:cursor-not-allowed disabled:bg-neutral-400"
        >
          {reading ? 'Reading…' : 'Check my bill'}
        </button>
        {reading && (
          <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
            {ocr.label}… {ocr.percent}%
          </p>
        )}
      </div>
      {ocr.kind === 'error' && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {ocr.message}
        </p>
      )}
      {redacted && isProfileEmpty(profile) && (
        <p role="alert" className="rounded-lg bg-amber-100 p-3 text-sm text-amber-950 dark:bg-amber-950/50 dark:text-amber-100">
          Add your details above so we can remove your name and address. Common fields like DOB and member ID are already
          removed by pattern.
        </p>
      )}
      {redacted && <RedactedView billText={redacted.bill} eobText={redacted.eob} />}
      {ocr.kind === 'done' && <OcrDebugPanel billText={ocr.billText} eobText={ocr.eobText} />}
    </form>
  );
}
