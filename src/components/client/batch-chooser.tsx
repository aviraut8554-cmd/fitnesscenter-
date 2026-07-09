'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { Alert, Badge, Button, Card } from '@/components/ui';

const WEEKDAY_LABELS: Record<string, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

type Schedule = {
  days?: string[];
  startTime?: string | null;
  endTime?: string | null;
};

type BatchOption = {
  id: string;
  title: string;
  isRecorded: boolean;
  schedule: Schedule | null;
  seatsLeft: number | null;
  instructorName: string | null;
  isDefault: boolean;
};

type Pending = {
  orderId: string;
  productId: string;
  productName: string;
  batches: BatchOption[];
};

function scheduleText(s: Schedule | null): string | null {
  if (!s) return null;
  const days = (s.days ?? []).map((d) => WEEKDAY_LABELS[d] ?? d);
  const time = s.startTime && s.endTime ? `${s.startTime}–${s.endTime}` : s.startTime ?? null;
  const parts = [days.length ? days.join(', ') : null, time].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * Lists offerings the client has paid for but not yet picked a batch for, and
 * lets them choose one. Used inline in the Classes tab and as a post-payment
 * prompt in the store. Calls `onResolved` after a successful pick.
 */
export function BatchChooser({
  onResolved,
  emptyWhenNone = true,
}: {
  onResolved?: () => void;
  emptyWhenNone?: boolean;
}) {
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<{ pending: Pending[] }>('/api/me/batch-selections');
      setPending(d.pending);
      setError(null);
    } catch (err) {
      setPending([]);
      setError(err instanceof ApiClientError ? err.message : 'Could not load your batches');
    }
  }, []);

  useEffect(() => {
    api
      .get<{ pending: Pending[] }>('/api/me/batch-selections')
      .then((d) => setPending(d.pending))
      .catch((err: unknown) => {
        setPending([]);
        setError(err instanceof ApiClientError ? err.message : 'Could not load your batches');
      });
  }, []);

  async function pick(productId: string, classId: string) {
    setBusy(classId);
    setError(null);
    try {
      await api.post('/api/me/batch-selections', { productId, classId });
      await load();
      onResolved?.();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not join that batch');
    } finally {
      setBusy(null);
    }
  }

  if (pending === null) return null;
  if (pending.length === 0) return emptyWhenNone ? null : null;

  return (
    <div className="space-y-3">
      {error ? <Alert>{error}</Alert> : null}
      {pending.map((p) => (
        <Card key={p.orderId} className="border-brand-200 bg-brand-50/40">
          <h3 className="text-sm font-bold text-ink-900">Choose your batch</h3>
          <p className="mt-0.5 text-xs text-ink-600">
            You paid for <span className="font-medium">{p.productName}</span>. Pick a batch below —
            if you don’t choose within 24 hours, we’ll place you in the default one.
          </p>
          <ul className="mt-3 space-y-2">
            {p.batches.map((b) => {
              const full = b.seatsLeft !== null && b.seatsLeft <= 0;
              const sched = scheduleText(b.schedule);
              return (
                <li
                  key={b.id}
                  className="flex flex-col gap-2 rounded-lg border border-ink-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink-900">{b.title}</span>
                      <Badge tone={b.isRecorded ? 'neutral' : 'brand'}>
                        {b.isRecorded ? 'Recorded' : 'Live'}
                      </Badge>
                      {b.isDefault ? <Badge tone="success">Default</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {b.instructorName ? `Coach: ${b.instructorName}` : 'Coach TBD'}
                      {sched ? ` · ${sched}` : ''}
                      {b.seatsLeft !== null ? ` · ${b.seatsLeft} seats left` : ''}
                    </p>
                  </div>
                  <Button
                    className="px-3 py-2 text-xs"
                    loading={busy === b.id}
                    disabled={full}
                    onClick={() => pick(p.productId, b.id)}
                  >
                    {full ? 'Full' : 'Join this batch'}
                  </Button>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </div>
  );
}
