'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiClientError } from '@/lib/api';
import { CLIENT_STATUSES, type Client, type ClientStatus, type HealthForm } from '@/lib/admin-types';
import { Alert, Badge, Button, Card, ClientStatusBadge, EmptyState } from '@/components/ui';

function formatJson(data: unknown): { key: string; value: string }[] {
  if (!data || typeof data !== 'object') return [];
  return Object.entries(data as Record<string, unknown>).map(([key, value]) => ({
    key,
    value: typeof value === 'object' ? JSON.stringify(value) : String(value),
  }));
}

export function ClientProfile({ clientId }: { clientId: string }) {
  const [client, setClient] = useState<Client | null>(null);
  const [forms, setForms] = useState<HealthForm[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Edit state
  const [status, setStatus] = useState<ClientStatus>('trial');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api
      .get<{ client: Client }>(`/api/clients/${clientId}`)
      .then((data) => {
        if (cancelled) return;
        setClient(data.client);
        setStatus(data.client.status);
        setNotes(data.client.notes ?? '');
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiClientError && err.status === 404) setNotFound(true);
        else setError(err instanceof ApiClientError ? err.message : 'Could not load client');
      });

    api
      .get<{ healthForms: HealthForm[] }>(`/api/clients/${clientId}/health-forms`)
      .then((data) => {
        if (!cancelled) setForms(data.healthForms);
      })
      .catch(() => {
        if (!cancelled) setForms([]);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const data = await api.patch<{ client: Client }>(`/api/clients/${clientId}`, {
        status,
        notes: notes || undefined,
      });
      setClient(data.client);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save changes');
    } finally {
      setSaving(false);
    }
  }

  if (notFound) {
    return (
      <EmptyState title="Client not found" hint="This client may have been removed, or belongs to another tenant." />
    );
  }

  if (!client) {
    return <p className="text-sm text-ink-500">Loading client…</p>;
  }

  const dirty = status !== client.status || (notes || '') !== (client.notes ?? '');

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/clients" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          ← Back to clients
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">{client.full_name}</h1>
          <ClientStatusBadge status={client.status} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-500">Contact</h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-ink-400">Email</dt>
              <dd className="font-medium text-ink-900">{client.email}</dd>
            </div>
            <div>
              <dt className="text-ink-400">Phone</dt>
              <dd className="font-medium text-ink-900">{client.phone ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-ink-400">Joined</dt>
              <dd className="font-medium text-ink-900 tabular-nums">
                {new Date(client.created_at).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-500">Manage</h2>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ClientStatus)}
                className="w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 sm:max-w-xs"
              >
                {CLIENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Private notes about this client"
                className="w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </label>
            {error ? <Alert>{error}</Alert> : null}
            {saved && !dirty ? <Alert tone="info">Changes saved.</Alert> : null}
            <Button onClick={save} loading={saving} disabled={!dirty}>
              Save changes
            </Button>
          </div>
        </Card>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-lg font-bold text-ink-900">Health form history</h2>
          {forms ? <Badge tone="neutral">{forms.length}</Badge> : null}
        </div>
        {forms === null ? (
          <p className="text-sm text-ink-500">Loading health forms…</p>
        ) : forms.length === 0 ? (
          <EmptyState title="No health forms yet" hint="Submissions appear here, newest first, each as a new version." />
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
                  {formatJson(form.data).map(({ key, value }) => (
                    <div key={key} className="text-sm">
                      <dt className="text-ink-400">{key}</dt>
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
