'use client';

import { useRef, useState } from 'react';
import { Button, Field } from '@/components/ui';

type Props = {
  label: string;
  value: string;
  onValueChange: (url: string) => void;
  name?: string;
  placeholder?: string;
  hint?: string;
};

/**
 * An image field with both a URL input and an "Upload" button. Uploading posts
 * the file to `/api/uploads` (public `assets` bucket) and fills the URL with the
 * returned public link, so admins can pick a file instead of hosting it elsewhere.
 */
export function ImageUploadField({ label, value, onValueChange, name, placeholder, hint }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/uploads', { method: 'POST', credentials: 'same-origin', body });
      const text = await res.text();
      const payload = text ? JSON.parse(text) : null;
      if (!res.ok) {
        throw new Error(payload?.error?.message ?? 'Upload failed');
      }
      onValueChange(payload.data.url as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <Field
        label={label}
        name={name}
        type="url"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder ?? 'https://…'}
      />
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          className="hidden"
          onChange={handleFile}
        />
        <Button
          type="button"
          variant="secondary"
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {value ? 'Replace image' : 'Upload image'}
        </Button>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt=""
            className="h-11 w-11 rounded-lg object-cover ring-1 ring-ink-200"
          />
        ) : null}
      </div>
      {hint ? <p className="text-xs text-ink-400">{hint}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
