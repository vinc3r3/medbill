// Shows redacted text with each replacement highlighted. This is the only form of the text that may
// leave the browser.
const TOKEN_RE = /(\[(?:NAME|DOB|MEMBER_ID|ADDRESS|ACCOUNT)\])/;

function Highlighted({ text }: { text: string }) {
  return text.split(TOKEN_RE).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded bg-emerald-200 px-0.5 font-semibold text-emerald-950 dark:bg-emerald-800 dark:text-emerald-50">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export function RedactedView({ billText, eobText }: { billText: string; eobText: string }) {
  const count = (billText.split(TOKEN_RE).length - 1) / 2 + (eobText.split(TOKEN_RE).length - 1) / 2;
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-emerald-500 p-4 dark:border-emerald-700">
      <div>
        <h2 className="text-lg font-semibold">What we&apos;ll send</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {count} personal detail{count === 1 ? '' : 's'} removed (highlighted). Only this text leaves your device.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          ['Bill', billText],
          ['EOB', eobText],
        ].map(([label, text]) => (
          <div key={label} className="flex min-w-0 flex-col gap-1">
            <h3 className="text-sm font-semibold">{label}</h3>
            <pre
              data-testid={`redacted-${label.toLowerCase()}`}
              className="max-h-96 overflow-auto rounded-md bg-neutral-50 p-3 text-xs whitespace-pre-wrap dark:bg-neutral-900"
            >
              <Highlighted text={text.trim() || '(no text found)'} />
            </pre>
          </div>
        ))}
      </div>
    </section>
  );
}
