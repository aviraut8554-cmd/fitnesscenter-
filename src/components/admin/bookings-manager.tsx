'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import {
  type BookingSettingsRow,
  type BookingWithRelations,
  type Client,
  type Slot,
  type TeamMember,
  type TeamRole,
} from '@/lib/admin-types';
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

export function BookingsManager({ viewerRole }: { viewerRole: TeamRole }) {
  const canManage = viewerRole === 'owner' || viewerRole === 'manager';

  const [bookings, setBookings] = useState<BookingWithRelations[] | null>(null);
  const [tz, setTz] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<{ bookings: BookingWithRelations[] }>('/api/bookings');
      setBookings(d.bookings);
      setError(null);
    } catch (err) {
      setBookings([]);
      setError(err instanceof ApiClientError ? err.message : 'Could not load bookings');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ bookings: BookingWithRelations[] }>('/api/bookings')
      .then((d) => !cancelled && setBookings(d.bookings))
      .catch((err: unknown) => {
        if (cancelled) return;
        setBookings([]);
        setError(err instanceof ApiClientError ? err.message : 'Could not load bookings');
      });
    api
      .get<{ settings: BookingSettingsRow }>('/api/booking-settings')
      .then((d) => !cancelled && setTz(d.settings.timezone))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function act(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await api.patch(`/api/bookings/${id}`, body);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not update booking');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {canManage ? <NewBookingForm onCreated={load} /> : null}

      {error ? <Alert>{error}</Alert> : null}

      {bookings === null ? (
        <p className="text-sm text-ink-500">Loading bookings…</p>
      ) : bookings.length === 0 ? (
        <EmptyState
          title="No bookings yet"
          hint="Consultations booked by you or your clients will appear here."
        />
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => {
            const active = b.status === 'scheduled' || b.status === 'rescheduled';
            return (
              <Card key={b.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink-900">
                      {b.client?.full_name ?? 'Client'}
                    </span>
                    <BookingStatusBadge status={b.status} />
                  </div>
                  <p className="mt-1 text-sm tabular-nums text-ink-600">{fmt(b.slot_start, tz)}</p>
                  {b.notes ? <p className="mt-1 text-sm text-ink-500">{b.notes}</p> : null}
                </div>
                {canManage && active ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5 text-xs"
                      loading={busyId === b.id}
                      onClick={() => act(b.id, { status: 'completed' })}
                    >
                      Mark done
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-3 py-1.5 text-xs"
                      loading={busyId === b.id}
                      onClick={() => act(b.id, { status: 'no_show' })}
                    >
                      No-show
                    </Button>
                    <Button
                      variant="danger"
                      className="px-3 py-1.5 text-xs"
                      loading={busyId === b.id}
                      onClick={() => act(b.id, { status: 'cancelled' })}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewBookingForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [coaches, setCoaches] = useState<TeamMember[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [coachId, setCoachId] = useState('');
  const [clientId, setClientId] = useState('');
  const [date, setDate] = useState(todayISODate());
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [tz, setTz] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    api
      .get<{ teamMembers: TeamMember[] }>('/api/team')
      .then((d) => {
        setCoaches(d.teamMembers);
        if (d.teamMembers[0]) setCoachId(d.teamMembers[0].id);
      })
      .catch(() => undefined);
    api
      .get<{ clients: Client[] }>('/api/clients')
      .then((d) => {
        setClients(d.clients);
        if (d.clients[0]) setClientId(d.clients[0].id);
      })
      .catch(() => undefined);
  }, [open]);

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
    if (!clientId) {
      setError('Select a client first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post('/api/bookings', {
        teamMemberId: coachId,
        clientId,
        slotStart,
        notes: notes.trim() || undefined,
      });
      setOpen(false);
      setNotes('');
      setSlots(null);
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not create booking');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>New booking</Button>;
  }

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-500">
        Book a consultation for a client
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Coach</span>
          <select value={coachId} onChange={(e) => setCoachId(e.target.value)} className={selectClass}>
            {coaches.map((m) => (
              <option key={m.id} value={m.id}>
                {(m.name || m.email || m.role) as string} ({m.role})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Client</span>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={selectClass}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={selectClass}
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="mb-1.5 block text-sm font-medium text-ink-700">Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={selectClass}
        />
      </label>

      <div className="mt-4 flex gap-3">
        <Button onClick={loadSlots} loading={loadingSlots} disabled={!coachId || !date}>
          Find slots
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>

      {error ? <div className="mt-4"><Alert>{error}</Alert></div> : null}

      {slots !== null ? (
        slots.length === 0 ? (
          <p className="mt-4 text-sm text-ink-500">
            No open slots for this day. Check the coach’s availability.
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
    </Card>
  );
}
