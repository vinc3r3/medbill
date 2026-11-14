'use client';

import { useEffect, useId, useRef, useState } from 'react';

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

type Props = {
  label: string;
  hint: string;
  file: File | null;
  onChange: (file: File | null) => void;
};

export function DropZone({ label, hint, file, onChange }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Object URL for the preview, created when a file is picked and revoked when replaced, removed or unmounted.
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const liveUrl = useRef<string | null>(null); // mirrors preview.url, for the unmount cleanup
  useEffect(() => () => {
    if (liveUrl.current) URL.revokeObjectURL(liveUrl.current);
  }, []);
  const previewUrl = preview && preview.file === file ? preview.url : null;

  function setFile(next: File | null) {
    if (liveUrl.current) URL.revokeObjectURL(liveUrl.current);
    const url = next ? URL.createObjectURL(next) : null;
    liveUrl.current = url;
    setPreview(next && url ? { file: next, url } : null);
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

      {previewUrl && file ? (
        <div className="flex flex-col gap-2 rounded-xl border border-neutral-300 p-3 dark:border-neutral-700">
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, not optimisable */}
          <img
            src={previewUrl}
            alt={`${label} preview`}
            className="max-h-96 w-full rounded-md bg-white object-contain object-top"
          />
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-neutral-600 dark:text-neutral-400" title={file.name}>
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
          className={`flex min-h-48 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-6 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            dragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
              : 'border-neutral-300 hover:border-neutral-500 dark:border-neutral-700'
          }`}
        >
          <span className="font-medium">Drop your {label.toLowerCase()} here</span>
          <span className="text-sm text-neutral-600 dark:text-neutral-400">or click to choose a photo or scan</span>
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
