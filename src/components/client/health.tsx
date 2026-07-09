'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/client-errors';
import type { HealthForm } from '@/lib/admin-types';
import { Alert, Badge, Button, Card, EmptyState } from '@/components/ui';

/** Structured intake fields. Stored as a freeform jsonb `data` blob server-side. */
const FIELDS: { key: string; label: string; placeholder: string; type?: string }[] = [
  { key: 'heightCm', label: 'Height (cm)', placeholder: '175', type: 'number' },
  { key: 'weightKg', label: 'Weight (kg)', placeholder: '72', type: 'number' },
  { key: 'goals', label: 'Goals', placeholder: 'Lose 5kg, build strength' },
  { key: 'injuries', label: 'Injuries / conditions', placeholder: 'None' },
  { key: 'notes', label: 'Anything else', placeholder: 'Prefer morning sessions' },
];

function entries(data: unknown): { key: string; value: string }[] {
  if (!data || typeof data !== 'object') return [];
  return Object.entries(data as Record<string, unknown>).map(([key, value]) => ({
    key,
    value: typeof value === 'object' ? JSON.stringify(value) : String(value),
  }));
}

const LABELS: Record<string, string> = Object.fromEntries(FIELDS.map((f) => [f.key, f.label]));

export function ClientHealth({ clientId }: { clientId: string }) {
  const [forms, setForms] = useState<HealthForm[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ healthForms: HealthForm[] }>(`/api/clients/${clientId}/health-forms`)
      .then((data) => {
        if (!cancelled) setForms(data.healthForms);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setForms([]);
        setError(friendlyError(err, 'Could not load your health forms'));
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  async function submit() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const data: Record<string, string> = {};
    for (const { key } of FIELDS) {
      const v = values[key]?.trim();
      if (v) data[key] = v;
    }
    if (Object.keys(data).length === 0) {
      setError('Fill in at least one field before submitting.');
      setSaving(false);
      return;
    }
    try {
      const res = await api.post<{ healthForm: HealthForm }>(
        `/api/clients/${clientId}/health-forms`,
        { data },
      );
      setForms((prev) => [res.healthForm, ...(prev ?? [])]);
      setValues({});
      setSaved(true);
    } catch (err) {
      setError(friendlyError(err, 'Could not submit your update'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-1 text-base font-bold text-ink-900">Submit an update</h2>
        <p className="mb-4 text-sm text-ink-500">
          Each submission is saved as a new version so your coach can track progress over time.
        </p>
        <div className="space-y-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">{f.label}</span>
              <input
                type={f.type ?? 'text'}
                inputMode={f.type === 'number' ? 'decimal' : undefined}
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </label>
          ))}
          {error ? <Alert>{error}</Alert> : null}
          {saved ? <Alert tone="info">Update submitted.</Alert> : null}
          <Button onClick={submit} loading={saving}>
            Submit update
          </Button>
        </div>
      </Card>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-base font-bold text-ink-900">My progress</h2>
          {forms ? <Badge tone="neutral">{forms.length}</Badge> : null}
        </div>
        {forms === null ? (
          <p className="text-sm text-ink-500">Loading history…</p>
        ) : forms.length === 0 ? (
          <EmptyState title="No updates yet" hint="Your first submission will appear here as Version 1." />
        ) : (
          <div className="space-y-3">
            {forms.map((form) => (
              <Card key={form.id}>
                <div className="mb-3 flex items-center justify-between">
                  <Badge tone="brand">Version {form.version}</Badge>
                  <span className="text-xs text-ink-400 tabular-nums">
                    {new Date(form.submitted_at).toLocaleString()}
                  </span>
                </div>
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {entries(form.data).map(({ key, value }) => (
                    <div key={key} className="text-sm">
                      <dt className="text-ink-400">{LABELS[key] ?? key}</dt>
                      <dd className="font-medium text-ink-900">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
