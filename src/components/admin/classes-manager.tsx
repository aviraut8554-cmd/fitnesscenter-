'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import {
  ATTENDANCE_STATUSES,
  type AttendanceEntry,
  type AttendanceStatus,
  type BookingSettingsRow,
  type ClassSession,
  type ClassWithRelations,
  type Client,
  type EnrollmentWithClient,
  type Offering,
  type OfferingSchedule,
  type TeamMember,
  type TeamRole,
} from '@/lib/admin-types';
import { Alert, Badge, Button, Card, EmptyState } from '@/components/ui';
import { OfferingForm } from '@/components/admin/offering-form';
import { formatMoney } from '@/lib/format';

const WEEKDAY_LABELS: Record<string, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

function scheduleSummary(schedule: OfferingSchedule): string | null {
  const days = (schedule.days ?? []).map((d) => WEEKDAY_LABELS[d] ?? d);
  const time =
    schedule.startTime && schedule.endTime
      ? `${schedule.startTime}–${schedule.endTime}`
      : schedule.startTime ?? null;
  const parts = [days.length ? days.join(', ') : null, time].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

const selectClass =
  'w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30';

function fmt(iso: string, tz?: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: tz,
  }).format(new Date(iso));
}

const ATTENDANCE_TONE: Record<AttendanceStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  registered: 'neutral',
  present: 'success',
  late: 'warning',
  excused: 'warning',
  absent: 'danger',
};

export function ClassesManager({ viewerRole }: { viewerRole: TeamRole }) {
  const canManage = viewerRole === 'owner' || viewerRole === 'manager';

  const [classes, setClasses] = useState<ClassWithRelations[] | null>(null);
  const [instructors, setInstructors] = useState<TeamMember[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [tz, setTz] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Offering | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<{ classes: ClassWithRelations[] }>('/api/classes');
      setClasses(d.classes);
      setError(null);
    } catch (err) {
      setClasses([]);
      setError(err instanceof ApiClientError ? err.message : 'Could not load classes');
    }
  }, []);

  useEffect(() => {
    api
      .get<{ classes: ClassWithRelations[] }>('/api/classes')
      .then((d) => setClasses(d.classes))
      .catch((err: unknown) => {
        setClasses([]);
        setError(err instanceof ApiClientError ? err.message : 'Could not load classes');
      });
    if (canManage) {
      api
        .get<{ teamMembers: TeamMember[] }>('/api/team')
        .then((d) => setInstructors(d.teamMembers))
        .catch(() => undefined);
      api
        .get<{ clients: Client[] }>('/api/clients')
        .then((d) => setClients(d.clients))
        .catch(() => undefined);
    }
    api
      .get<{ settings: BookingSettingsRow }>('/api/booking-settings')
      .then((d) => setTz(d.settings.timezone))
      .catch(() => undefined);
  }, [canManage, load]);

  const formOpen = creating || editing !== null;

  async function afterSave() {
    setCreating(false);
    setEditing(null);
    await load();
  }

  return (
    <div className="space-y-6">
      {canManage ? (
        formOpen ? (
          <OfferingForm
            instructors={instructors}
            editing={editing}
            onDone={afterSave}
            onCancel={() => {
              setCreating(false);
              setEditing(null);
            }}
          />
        ) : (
          <Button onClick={() => setCreating(true)}>New offering</Button>
        )
      ) : null}

      {error ? <Alert>{error}</Alert> : null}

      {classes === null ? (
        <p className="text-sm text-ink-500">Loading classes…</p>
      ) : classes.length === 0 ? (
        <EmptyState
          title="No offerings yet"
          hint={canManage ? 'Create your first offering — sets up the store product and its class in one form.' : 'Your coaches haven’t scheduled any classes yet.'}
        />
      ) : (
        <div className="space-y-4">
          {classes.map((c) => (
            <ClassCard
              key={c.id}
              cls={c}
              tz={tz}
              canManage={canManage}
              clients={clients}
              onChanged={load}
              onEdit={() => {
                setCreating(false);
                setEditing(c);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ClassCard({
  cls,
  tz,
  canManage,
  clients,
  onChanged,
  onEdit,
}: {
  cls: ClassWithRelations;
  tz?: string;
  canManage: boolean;
  clients: Client[];
  onChanged: () => Promise<void>;
  onEdit: () => void;
}) {
  const [tab, setTab] = useState<'sessions' | 'roster' | null>(null);
  const schedule = scheduleSummary((cls.schedule ?? {}) as OfferingSchedule);
  const accessLink = ((cls.schedule ?? {}) as OfferingSchedule).accessLink;
  const price =
    cls.product && cls.product.amount_minor > 0
      ? formatMoney(cls.product.amount_minor, cls.product.currency)
      : cls.product
        ? 'Free'
        : null;

  return (
    <Card className={cls.product && !cls.product.is_active ? 'border-dashed opacity-60' : ''}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold text-ink-900">{cls.title}</span>
            <Badge tone={cls.is_recorded ? 'neutral' : 'brand'}>
              {cls.is_recorded ? 'Recorded' : 'Live'}
            </Badge>
            {cls.product?.is_bestseller ? <Badge tone="warning">Bestseller</Badge> : null}
            {price ? <Badge tone="success">{price}</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {cls.instructor ? `Coach: ${cls.instructor.name}` : 'No instructor assigned'} ·{' '}
            {cls.enrollmentCount} enrolled · {cls.sessions.length} session
            {cls.sessions.length === 1 ? '' : 's'}
          </p>
          {schedule ? <p className="mt-1 text-sm text-ink-600">{schedule}</p> : null}
          {accessLink ? (
            <a
              href={accessLink}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-xs font-medium text-brand-600 hover:underline"
            >
              Access link
            </a>
          ) : null}
          {cls.description ? <p className="mt-1 text-sm text-ink-600">{cls.description}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={onEdit}>
              Edit
            </Button>
          ) : null}
          <Button
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            onClick={() => setTab(tab === 'sessions' ? null : 'sessions')}
          >
            Sessions
          </Button>
          {canManage ? (
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              onClick={() => setTab(tab === 'roster' ? null : 'roster')}
            >
              Roster
            </Button>
          ) : null}
        </div>
      </div>

      {tab === 'sessions' ? (
        <SessionsPanel cls={cls} tz={tz} canManage={canManage} onChanged={onChanged} />
      ) : null}
      {tab === 'roster' && canManage ? (
        <RosterPanel classId={cls.id} clients={clients} onChanged={onChanged} />
      ) : null}
    </Card>
  );
}

function SessionsPanel({
  cls,
  tz,
  canManage,
  onChanged,
}: {
  cls: ClassWithRelations;
  tz?: string;
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [liveLink, setLiveLink] = useState('');
  const [recordingUrl, setRecordingUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openAttendance, setOpenAttendance] = useState<string | null>(null);

  async function addSession() {
    if (!startsAt || !endsAt) {
      setError('Set a start and end time.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post(`/api/classes/${cls.id}/sessions`, {
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        liveLink: liveLink.trim() || undefined,
        recordingUrl: recordingUrl.trim() || undefined,
      });
      setAdding(false);
      setStartsAt('');
      setEndsAt('');
      setLiveLink('');
      setRecordingUrl('');
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not add session');
    } finally {
      setSaving(false);
    }
  }

  async function removeSession(id: string) {
    try {
      await api.del(`/api/class-sessions/${id}`);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not delete session');
    }
  }

  return (
    <div className="mt-4 border-t border-ink-100 pt-4">
      {error ? <div className="mb-3"><Alert>{error}</Alert></div> : null}

      {cls.sessions.length === 0 ? (
        <p className="text-sm text-ink-500">No sessions scheduled yet.</p>
      ) : (
        <ul className="space-y-2">
          {cls.sessions.map((s: ClassSession) => (
            <li key={s.id} className="rounded-lg border border-ink-100 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold tabular-nums text-ink-900">
                    {fmt(s.starts_at, tz)} → {fmt(s.ends_at, tz)}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {s.live_link ? 'Live link set' : cls.is_recorded ? '' : 'No live link'}
                    {s.recording_url ? ' · Recording set' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => setOpenAttendance(openAttendance === s.id ? null : s.id)}
                  >
                    Attendance
                  </Button>
                  {canManage ? (
                    <Button
                      variant="ghost"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => removeSession(s.id)}
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>
              </div>
              {openAttendance === s.id ? <AttendanceSheet sessionId={s.id} /> : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        adding ? (
          <div className="mt-4 grid gap-3 rounded-lg border border-ink-100 p-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">Starts</span>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className={selectClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">Ends</span>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className={selectClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">Live link (optional)</span>
              <input
                value={liveLink}
                onChange={(e) => setLiveLink(e.target.value)}
                placeholder="https://…"
                className={selectClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">Recording URL (optional)</span>
              <input
                value={recordingUrl}
                onChange={(e) => setRecordingUrl(e.target.value)}
                placeholder="https://…"
                className={selectClass}
              />
            </label>
            <div className="flex gap-3 sm:col-span-2">
              <Button onClick={addSession} loading={saving}>Add session</Button>
              <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setAdding(true)}>
              Add session
            </Button>
          </div>
        )
      ) : null}
    </div>
  );
}

function AttendanceSheet({ sessionId }: { sessionId: string }) {
  const [entries, setEntries] = useState<AttendanceEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<{ attendance: AttendanceEntry[] }>(
        `/api/class-sessions/${sessionId}/attendance`,
      );
      setEntries(d.attendance);
    } catch (err) {
      setEntries([]);
      setError(err instanceof ApiClientError ? err.message : 'Could not load attendance');
    }
  }, [sessionId]);

  useEffect(() => {
    api
      .get<{ attendance: AttendanceEntry[] }>(`/api/class-sessions/${sessionId}/attendance`)
      .then((d) => setEntries(d.attendance))
      .catch((err: unknown) => {
        setEntries([]);
        setError(err instanceof ApiClientError ? err.message : 'Could not load attendance');
      });
  }, [sessionId]);

  async function mark(clientId: string, status: AttendanceStatus) {
    setBusy(clientId);
    setError(null);
    try {
      await api.post(`/api/class-sessions/${sessionId}/attendance`, { clientId, status });
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not mark attendance');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 border-t border-ink-100 pt-3">
      {error ? <div className="mb-2"><Alert>{error}</Alert></div> : null}
      {entries === null ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-ink-500">No active enrollments to mark.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li key={e.clientId} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink-800">{e.fullName}</span>
                <Badge tone={ATTENDANCE_TONE[e.status]}>{e.status}</Badge>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ATTENDANCE_STATUSES.filter((s) => s !== 'registered').map((s) => (
                  <Button
                    key={s}
                    variant={e.status === s ? 'primary' : 'secondary'}
                    className="px-2.5 py-1 text-xs"
                    loading={busy === e.clientId}
                    onClick={() => mark(e.clientId, s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RosterPanel({
  classId,
  clients,
  onChanged,
}: {
  classId: string;
  clients: Client[];
  onChanged: () => Promise<void>;
}) {
  const [enrollments, setEnrollments] = useState<EnrollmentWithClient[] | null>(null);
  const [clientId, setClientId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.get<{ enrollments: EnrollmentWithClient[] }>(
        `/api/classes/${classId}/enrollments`,
      );
      setEnrollments(d.enrollments);
    } catch (err) {
      setEnrollments([]);
      setError(err instanceof ApiClientError ? err.message : 'Could not load roster');
    }
  }, [classId]);

  useEffect(() => {
    api
      .get<{ enrollments: EnrollmentWithClient[] }>(`/api/classes/${classId}/enrollments`)
      .then((d) => setEnrollments(d.enrollments))
      .catch((err: unknown) => {
        setEnrollments([]);
        setError(err instanceof ApiClientError ? err.message : 'Could not load roster');
      });
  }, [classId]);

  async function enroll() {
    if (!clientId) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/classes/${classId}/enrollments`, { clientId });
      await load();
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not enrol client');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await api.del(`/api/enrollments/${id}`);
      await load();
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not remove enrollment');
    }
  }

  return (
    <div className="mt-4 border-t border-ink-100 pt-4">
      {error ? <div className="mb-3"><Alert>{error}</Alert></div> : null}

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Enrol a client</span>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={selectClass}>
            <option value="">Select…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={enroll} loading={busy} disabled={!clientId}>Enrol</Button>
      </div>

      {enrollments === null ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : enrollments.length === 0 ? (
        <p className="text-sm text-ink-500">
          No one enrolled yet. Clients are auto-enrolled when they buy the linked product.
        </p>
      ) : (
        <ul className="space-y-2">
          {enrollments.map((e) => (
            <li key={e.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink-800">
                  {e.client?.full_name ?? 'Client'}
                </span>
                <Badge tone={e.status === 'active' ? 'success' : 'neutral'}>{e.status}</Badge>
              </div>
              <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => remove(e.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
