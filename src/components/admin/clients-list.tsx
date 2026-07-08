'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ApiClientError } from '@/lib/api';
import { CLIENT_STATUSES, type Client, type ClientStatus } from '@/lib/admin-types';
import { parseCsv, rowsToClients, type ClientCsvRow } from '@/lib/csv';
import { Alert, Button, Card, ClientStatusBadge, EmptyState, Field, Table } from '@/components/ui';

const selectClass =
  'w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30';

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function ClientsList() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ClientStatus | ''>('');
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<'none' | 'add' | 'import'>('none');
  const [refreshKey, setRefreshKey] = useState(0);

  const debouncedSearch = useDebounced(search, 300);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (status) params.set('status', status);
    const qs = params.toString();

    api
      .get<{ clients: Client[] }>(`/api/clients${qs ? `?${qs}` : ''}`)
      .then((data) => {
        if (cancelled) return;
        setClients(data.clients);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setClients([]);
        setError(err instanceof ApiClientError ? err.message : 'Could not load clients');
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, status, refreshKey]);

  const count = clients?.length ?? 0;
  const countLabel = useMemo(
    () => (clients === null ? '' : `${count} client${count === 1 ? '' : 's'}`),
    [clients, count],
  );

  const reload = () => setRefreshKey((k) => k + 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name"
            aria-label="Search clients by name"
            className="w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 sm:max-w-xs"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ClientStatus | '')}
            aria-label="Filter by status"
            className="rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            <option value="">All statuses</option>
            {CLIENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          {countLabel ? <span className="text-sm text-ink-500 tabular-nums">{countLabel}</span> : null}
          <Button
            variant="secondary"
            className="px-3 py-2 text-sm"
            onClick={() => setPanel(panel === 'import' ? 'none' : 'import')}
          >
            Import CSV
          </Button>
          <Button
            className="px-3 py-2 text-sm"
            onClick={() => setPanel(panel === 'add' ? 'none' : 'add')}
          >
            Add client
          </Button>
        </div>
      </div>

      {panel === 'add' ? (
        <AddClientPanel
          onClose={() => setPanel('none')}
          onCreated={() => {
            reload();
            setPanel('none');
          }}
        />
      ) : null}
      {panel === 'import' ? (
        <ImportCsvPanel onClose={() => setPanel('none')} onImported={reload} />
      ) : null}

      {error ? <Alert>{error}</Alert> : null}

      {clients === null ? (
        <p className="text-sm text-ink-500">Loading clients…</p>
      ) : count === 0 ? (
        <EmptyState
          title={search || status ? 'No clients match your filters' : 'No clients yet'}
          hint={
            search || status
              ? 'Try clearing the search or status filter.'
              : 'Add a client manually, import a CSV, or share your branded signup link.'
          }
        />
      ) : (
        <Table
          head={
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Joined</th>
            </tr>
          }
        >
          {clients.map((client) => (
            <tr key={client.id} className="hover:bg-ink-50">
              <td className="px-4 py-3">
                <Link
                  href={`/admin/clients/${client.id}`}
                  className="font-semibold text-ink-900 hover:text-brand-600"
                >
                  {client.full_name}
                </Link>
              </td>
              <td className="px-4 py-3 text-ink-600">{client.email}</td>
              <td className="px-4 py-3">
                <ClientStatusBadge status={client.status} />
              </td>
              <td className="px-4 py-3 text-ink-500 tabular-nums">
                {new Date(client.created_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function AddClientPanel({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<ClientStatus>('trial');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/api/clients', {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        status,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not add client');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-500">
        Add a client
      </h2>
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Full name"
          name="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
        <Field
          label="Email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Field
          label="Phone (optional)"
          name="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ClientStatus)}
            className={selectClass}
          >
            {CLIENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2 sm:col-span-2">
          <Button type="submit" loading={saving}>
            Save client
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

type ImportSummary = {
  created: number;
  skippedExisting: number;
  invalid: { row: number; error: string }[];
  total: number;
};

function ImportCsvPanel({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ClientCsvRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setError(null);
    setSummary(null);
    setParsed(null);
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = rowsToClients(parseCsv(String(reader.result ?? '')));
        if (rows.length === 0) {
          setError('No data rows found. Include a header row (name, email, phone, status).');
          return;
        }
        setParsed(rows);
      } catch {
        setError('Could not read that file. Make sure it is a valid CSV.');
      }
    };
    reader.onerror = () => setError('Could not read that file.');
    reader.readAsText(file);
  }

  async function doImport() {
    if (!parsed) return;
    setImporting(true);
    setError(null);
    try {
      const res = await api.post<ImportSummary>('/api/clients/import', { clients: parsed });
      setSummary(res);
      if (res.created > 0) onImported();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
        Import clients from CSV
      </h2>
      <p className="mb-4 text-sm text-ink-500">
        Columns: <span className="font-medium text-ink-700">name</span>,{' '}
        <span className="font-medium text-ink-700">email</span> (required),{' '}
        <span className="font-medium text-ink-700">phone</span>,{' '}
        <span className="font-medium text-ink-700">status</span> (optional). Existing emails and
        duplicate rows are skipped automatically.
      </p>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        onChange={onFile}
        className="block w-full text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700"
      />

      {parsed && !summary ? (
        <p className="mt-3 text-sm text-ink-600">
          <span className="font-semibold text-ink-900">{parsed.length}</span> row
          {parsed.length === 1 ? '' : 's'} ready from{' '}
          <span className="font-medium">{fileName}</span>.
        </p>
      ) : null}

      {summary ? (
        <div className="mt-4 space-y-2 text-sm">
          <Alert tone="info">
            Imported <span className="font-semibold">{summary.created}</span> new client
            {summary.created === 1 ? '' : 's'}
            {summary.skippedExisting > 0
              ? `; skipped ${summary.skippedExisting} already-existing`
              : ''}
            {summary.invalid.length > 0 ? `; ${summary.invalid.length} invalid` : ''}.
          </Alert>
          {summary.invalid.length > 0 ? (
            <ul className="max-h-40 overflow-auto rounded-lg border border-ink-100 bg-ink-50 p-3 text-ink-600">
              {summary.invalid.slice(0, 50).map((iv) => (
                <li key={iv.row} className="tabular-nums">
                  Row {iv.row}: {iv.error}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex gap-2">
        {summary ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button onClick={doImport} loading={importing} disabled={!parsed}>
              Import {parsed ? `${parsed.length} ` : ''}client{parsed && parsed.length === 1 ? '' : 's'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
