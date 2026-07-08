'use client';

import { useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import {
  WEEKDAY_LABELS,
  type AvailabilityRule,
  type BookingSettingsRow,
  type TeamMember,
} from '@/lib/admin-types';
import { Alert, Button, Card, EmptyState, Field } from '@/components/ui';

const selectClass =
  'w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30';

function coachLabel(m: TeamMember): string {
  return m.name || m.email || `${m.role}`;
}

export function AvailabilityManager() {
  const [coaches, setCoaches] = useState<TeamMember[] | null>(null);
  const [coachId, setCoachId] = useState('');
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [settings, setSettings] = useState<BookingSettingsRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [savingRule, setSavingRule] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    api
      .get<{ teamMembers: TeamMember[] }>('/api/team')
      .then((d) => {
        setCoaches(d.teamMembers);
        if (d.teamMembers[0]) setCoachId(d.teamMembers[0].id);
      })
      .catch((e: unknown) =>
        setError(e instanceof ApiClientError ? e.message : 'Could not load team'),
      );
    api
      .get<{ settings: BookingSettingsRow }>('/api/booking-settings')
      .then((d) => setSettings(d.settings))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!coachId) return;
    api
      .get<{ rules: AvailabilityRule[] }>(`/api/availability?teamMemberId=${coachId}`)
      .then((d) => setRules(d.rules))
      .catch((e: unknown) =>
        setError(e instanceof ApiClientError ? e.message : 'Could not load availability'),
      );
  }, [coachId]);

  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    setSavingRule(true);
    setError(null);
    try {
      const { rule } = await api.post<{ rule: AvailabilityRule }>('/api/availability', {
        teamMemberId: coachId,
        weekday,
        startTime,
        endTime,
      });
      setRules((prev) =>
        [...prev, rule].sort(
          (a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time),
        ),
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not add window');
    } finally {
      setSavingRule(false);
    }
  }

  async function removeRule(id: string) {
    setError(null);
    try {
      await api.del(`/api/availability/${id}`);
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not remove window');
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSavingSettings(true);
    setError(null);
    setNotice(null);
    try {
      const { settings: saved } = await api.put<{ settings: BookingSettingsRow }>(
        '/api/booking-settings',
        {
          timezone: settings.timezone,
          slotMinutes: settings.slot_minutes,
          bufferMinutes: settings.buffer_minutes,
          minNoticeMinutes: settings.min_notice_minutes,
          cancelCutoffMinutes: settings.cancel_cutoff_minutes,
        },
      );
      setSettings(saved);
      setNotice('Booking policy saved.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save policy');
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="info">{notice}</Alert> : null}

      {settings ? (
        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-500">
            Booking policy
          </h2>
          <form onSubmit={saveSettings} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Timezone"
              name="timezone"
              value={settings.timezone}
              onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
            />
            <Field
              label="Slot length (min)"
              name="slot"
              type="number"
              min="5"
              max="480"
              value={settings.slot_minutes}
              onChange={(e) => setSettings({ ...settings, slot_minutes: Number(e.target.value) })}
            />
            <Field
              label="Buffer between slots (min)"
              name="buffer"
              type="number"
              min="0"
              max="240"
              value={settings.buffer_minutes}
              onChange={(e) => setSettings({ ...settings, buffer_minutes: Number(e.target.value) })}
            />
            <Field
              label="Min notice (min)"
              name="notice"
              type="number"
              min="0"
              value={settings.min_notice_minutes}
              onChange={(e) =>
                setSettings({ ...settings, min_notice_minutes: Number(e.target.value) })
              }
            />
            <Field
              label="Cancel cutoff (min)"
              name="cutoff"
              type="number"
              min="0"
              value={settings.cancel_cutoff_minutes}
              onChange={(e) =>
                setSettings({ ...settings, cancel_cutoff_minutes: Number(e.target.value) })
              }
            />
            <div className="flex items-end">
              <Button type="submit" loading={savingSettings}>
                Save policy
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-500">
          Weekly availability
        </h2>
        <label className="mb-4 block max-w-xs">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Coach</span>
          <select
            value={coachId}
            onChange={(e) => setCoachId(e.target.value)}
            className={selectClass}
          >
            {(coaches ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {coachLabel(m)} ({m.role})
              </option>
            ))}
          </select>
        </label>

        <form onSubmit={addRule} className="mb-5 grid gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Day</span>
            <select
              value={weekday}
              onChange={(e) => setWeekday(Number(e.target.value))}
              className={selectClass}
            >
              {WEEKDAY_LABELS.map((label, i) => (
                <option key={label} value={i}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="From"
            name="from"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
          <Field
            label="To"
            name="to"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
          <div className="flex items-end">
            <Button type="submit" loading={savingRule} disabled={!coachId}>
              Add window
            </Button>
          </div>
        </form>

        {rules.length === 0 ? (
          <EmptyState
            title="No availability yet"
            hint="Add weekly windows so clients can book this coach."
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-medium text-ink-800">
                  {WEEKDAY_LABELS[r.weekday]}{' '}
                  <span className="tabular-nums text-ink-500">
                    {r.start_time.slice(0, 5)}–{r.end_time.slice(0, 5)}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  className="px-3 py-1.5 text-xs"
                  onClick={() => removeRule(r.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
