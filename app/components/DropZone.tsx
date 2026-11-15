'use client';

import { useEffect, useId, useRef, useState } from 'react';

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

type Props = {
  label: string;
  hint: string;
  file: File | null;
  onChange: (file: File | null) => void;
};

/**
 * Preview of whatever file is shown, whether the user picked it or the page set it (a sample). The object
 * URL is created and revoked in an effect, so it follows the file and never leaks.
 */
function FilePreview({ file, alt }: { file: File; alt: string }) {
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (img.current) img.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  // eslint-disable-next-line @next/next/no-img-element -- local blob preview, not optimisable
  return <img ref={img} alt={alt} className="max-h-96 min-h-24 w-full rounded-md bg-white object-contain object-top" />;
}

export function DropZone({ label, hint, file, onChange }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function setFile(next: File | null) {
    onChange(next);
  }

  function accept(files: FileList | null) {
    const picked = files?.[0];
    if (!picked) return;
    if (!ACCEPTED_TYPES.includes(picked.type)) {
      setError(`"${picked.name}" isn't a supported image. Please use a PNG, JPEG or WebP photo or scan.`);
      return;
    }
    setError(null);
    setFile(picked);
  }

  return (
    <section className="flex flex-col gap-2" aria-labelledby={`${inputId}-label`}>
      <h2 id={`${inputId}-label`} className="text-lg font-semibold">
        {label}
      </h2>

      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        className="sr-only"
        data-testid={`${label.toLowerCase()}-input`}
        onChange={(e) => {
          accept(e.target.files);
          e.target.value = ''; // allow re-picking the same file
        }}
      />

      {file ? (
        <div className="card flex flex-col gap-2 p-3">
          <FilePreview file={file} alt={`${label} preview`} />
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-muted" title={file.name}>
              {file.name}
            </span>
            <span className="flex shrink-0 gap-2">
              <button type="button" className="rounded-md px-2 py-1 underline" onClick={() => inputRef.current?.click()}>
                Replace
              </button>
              <button type="button" className="rounded-md px-2 py-1 underline" onClick={() => setFile(null)}>
                Remove
              </button>
            </span>
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            accept(e.dataTransfer.files);
          }}
          className={`flex min-h-48 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-6 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
            dragging
              ? 'border-brand bg-brand-soft'
              : 'border-line bg-surface hover:border-brand'
          }`}
        >
          <span className="font-medium">Drop your {label.toLowerCase()} here</span>
          <span className="text-sm text-muted">or click to choose a photo or scan</span>
          <span className="mt-2 text-xs text-neutral-500">{hint}</span>
        </label>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
