'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import type { BookingSettingsRow, BookingWithRelations, Coach, Slot } from '@/lib/admin-types';
import { Alert, BookingStatusBadge, Button, Card, EmptyState } from '@/components/ui';

const selectClass =
  'w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30';

function fmt(iso: string, tz?: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: tz,
  }).format(new Date(iso));
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function BookConsultation() {
  const [coaches, setCoaches] = useState<Coach[] | null>(null);
  const [coachId, setCoachId] = useState('');
  const [date, setDate] = useState(todayISODate());
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [tz, setTz] = useState<string | undefined>(undefined);
  const [mine, setMine] = useState<BookingWithRelations[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadMine = useCallback(async () => {
    try {
      const d = await api.get<{ bookings: BookingWithRelations[] }>('/api/bookings');
      setMine(d.bookings);
    } catch {
      setMine([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ coaches: Coach[] }>('/api/coaches')
      .then((d) => {
        if (cancelled) return;
        setCoaches(d.coaches);
        if (d.coaches[0]) setCoachId(d.coaches[0].id);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof ApiClientError ? e.message : 'Could not load coaches');
      });
    api
      .get<{ bookings: BookingWithRelations[] }>('/api/bookings')
      .then((d) => !cancelled && setMine(d.bookings))
      .catch(() => !cancelled && setMine([]));
    api
      .get<{ settings: BookingSettingsRow }>('/api/booking-settings')
      .then((d) => !cancelled && setTz(d.settings.timezone))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadSlots() {
    if (!coachId || !date) return;
    setLoadingSlots(true);
    setError(null);
    setSlots(null);
    const from = new Date(`${date}T00:00:00`);
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    try {
      const d = await api.get<{ slots: Slot[]; timezone: string }>(
        `/api/bookings/slots?teamMemberId=${coachId}&from=${from.toISOString()}&to=${to.toISOString()}`,
      );
      setSlots(d.slots);
      setTz(d.timezone);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not load slots');
    } finally {
      setLoadingSlots(false);
    }
  }

  async function book(slotStart: string) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api.post('/api/bookings', { teamMemberId: coachId, slotStart });
      setSlots(null);
      setNotice('Your consultation is booked.');
      await loadMine();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not book slot');
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id: string) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      await api.patch(`/api/bookings/${id}`, { status: 'cancelled' });
      await loadMine();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not cancel');
    } finally {
      setBusyId(null);
    }
  }

  const upcoming = (mine ?? []).filter(
    (b) => b.status === 'scheduled' || b.status === 'rescheduled',
  );

  return (
    <div className="space-y-6">
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="info">{notice}</Alert> : null}

      <Card>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-500">
          Book a slot
        </h2>
        {coaches !== null && coaches.length === 0 ? (
          <p className="text-sm text-ink-500">
            No coaches have opened availability yet. Please check back soon.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink-700">Coach</span>
                <select
                  value={coachId}
                  onChange={(e) => setCoachId(e.target.value)}
                  className={selectClass}
                >
                  {(coaches ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink-700">Date</span>
                <input
                  type="date"
                  value={date}
                  min={todayISODate()}
                  onChange={(e) => setDate(e.target.value)}
                  className={selectClass}
                />
              </label>
            </div>
            <div className="mt-4">
              <Button onClick={loadSlots} loading={loadingSlots} disabled={!coachId}>
                Show times
              </Button>
            </div>

            {slots !== null ? (
              slots.length === 0 ? (
                <p className="mt-4 text-sm text-ink-500">
                  No open times that day. Try another date.
                </p>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  {slots.map((s) => (
                    <Button
                      key={s.start}
                      variant="secondary"
                      className="px-3 py-1.5 text-xs tabular-nums"
                      loading={saving}
                      onClick={() => book(s.start)}
                    >
                      {fmt(s.start, tz)}
                    </Button>
                  ))}
                </div>
              )
            ) : null}
          </>
        )}
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
          Your upcoming consultations
        </h2>
        {mine === null ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : upcoming.length === 0 ? (
          <EmptyState title="Nothing booked yet" hint="Pick a slot above to book a consultation." />
        ) : (
          <div className="space-y-3">
            {upcoming.map((b) => (
              <Card key={b.id} className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums text-ink-900">
                      {fmt(b.slot_start, tz)}
                    </span>
                    <BookingStatusBadge status={b.status} />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  className="px-3 py-1.5 text-xs"
                  loading={busyId === b.id}
                  onClick={() => cancel(b.id)}
                >
                  Cancel
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
