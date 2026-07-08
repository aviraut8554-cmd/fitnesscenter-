'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, ApiClientError } from '@/lib/api';
import { CLIENT_STATUSES, type Client, type ClientStatus } from '@/lib/admin-types';
import { Alert, ClientStatusBadge, EmptyState, Table } from '@/components/ui';

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
  }, [debouncedSearch, status]);

  const count = clients?.length ?? 0;
  const countLabel = useMemo(() => (clients === null ? '' : `${count} client${count === 1 ? '' : 's'}`), [clients, count]);

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
        {countLabel ? <span className="text-sm text-ink-500 tabular-nums">{countLabel}</span> : null}
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {clients === null ? (
        <p className="text-sm text-ink-500">Loading clients…</p>
      ) : count === 0 ? (
        <EmptyState
          title={search || status ? 'No clients match your filters' : 'No clients yet'}
          hint={
            search || status
              ? 'Try clearing the search or status filter.'
              : 'Clients appear here when they sign up through your branded link.'
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
