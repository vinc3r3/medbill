// Debug view of the raw OCR text. Shown on screen only; this text is never sent anywhere as-is.
export function OcrDebugPanel({ billText, eobText }: { billText: string; eobText: string }) {
  return (
    <details className="rounded-xl border border-amber-400 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
      <summary className="cursor-pointer font-semibold">Debug: raw text read on this device (never sent)</summary>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {[
          ['Bill', billText],
          ['EOB', eobText],
        ].map(([label, text]) => (
          <div key={label} className="flex min-w-0 flex-col gap-1">
            <h3 className="text-sm font-semibold">{label}</h3>
            <pre
              data-testid={`ocr-${label.toLowerCase()}`}
              className="max-h-96 overflow-auto rounded-md bg-white p-3 text-xs whitespace-pre-wrap dark:bg-neutral-900"
            >
              {text.trim() || '(no text found)'}
            </pre>
          </div>
        ))}
      </div>
    </details>
  );
}
