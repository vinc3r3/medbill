'use client';

import { useState } from 'react';
import { DropZone } from './DropZone';

export function UploadForm() {
  const [bill, setBill] = useState<File | null>(null);
  const [eob, setEob] = useState<File | null>(null);
  const ready = bill !== null && eob !== null;

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        // Task 4 runs on-device OCR here.
      }}
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <DropZone label="Bill" hint="The statement from your doctor or hospital" file={bill} onChange={setBill} />
        <DropZone label="EOB" hint="The Explanation of Benefits from your insurer" file={eob} onChange={setEob} />
      </div>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Your documents stay on this device. Text is read here, and personal details are removed before anything is
        sent.
      </p>
      <button
        type="submit"
        disabled={!ready}
        className="self-start rounded-lg bg-blue-700 px-5 py-2.5 font-medium text-white disabled:cursor-not-allowed disabled:bg-neutral-400"
      >
        Check my bill
      </button>
    </form>
  );
}
