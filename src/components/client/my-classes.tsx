'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/client-errors';
import type { BookingSettingsRow, ClientClass } from '@/lib/admin-types';
import { Alert, Avatar, Badge, Button, Card, EmptyState, SkeletonCard } from '@/components/ui';
import { BatchChooser } from '@/components/client/batch-chooser';
import { PullToRefresh } from '@/components/client/pull-to-refresh';

function fmt(iso: string, tz?: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: tz,
  }).format(new Date(iso));
}

/** Human "in 3h" / "in 2 days" countdown to a start time. */
function untilLabel(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return 'happening now';
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'in <1 min';
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

export function MyClasses() {
  const [classes, setClasses] = useState<ClientClass[] | null>(null);
  const [tz, setTz] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<{ classes: ClientClass[] }>('/api/my-classes');
      setClasses(d.classes);
      setError(null);
    } catch (err) {
      setClasses((prev) => prev ?? []);
      setError(friendlyError(err, 'Could not load your classes'));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ classes: ClientClass[] }>('/api/my-classes')
      .then((d) => !cancelled && setClasses(d.classes))
      .catch((err: unknown) => {
        if (cancelled) return;
        setClasses([]);
        setError(friendlyError(err, 'Could not load your classes'));
      });
    api
      .get<{ settings: BookingSettingsRow }>('/api/booking-settings')
      .then((d) => !cancelled && setTz(d.settings.timezone))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (classes === null)
    return (
      <div className="space-y-3">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );

  return (
    <PullToRefresh onRefresh={load}>
    <div className="space-y-4">
      <BatchChooser onResolved={() => void load()} />

      {classes.length === 0 ? (
        <EmptyState
          title="No classes yet"
          hint="Buy a class from the Shop and it will show up here automatically."
        />
      ) : null}

      {classes.map((c) => {
        const upcoming = c.sessions.filter((s) => new Date(s.endsAt).getTime() >= Date.now());
        const liveNow = c.sessions.find((s) => s.isLive);
        const nextUpcoming = upcoming[0];
        return (
          <Card key={c.id}>
            <div className="flex items-start gap-3">
              <Avatar name={c.instructorName} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold text-ink-900">{c.title}</span>
                  <Badge tone={c.isRecorded ? 'neutral' : 'brand'}>
                    {c.isRecorded ? 'Recorded' : 'Live'}
                  </Badge>
                  {liveNow ? <Badge tone="success">Live now</Badge> : null}
                </div>
                {c.instructorName ? (
                  <p className="mt-0.5 text-sm text-ink-500">Coach: {c.instructorName}</p>
                ) : null}
                {!c.isRecorded && !liveNow && nextUpcoming ? (
                  <p className="mt-0.5 text-xs font-medium text-brand-600">
                    Next session {untilLabel(nextUpcoming.startsAt)}
                  </p>
                ) : null}
              </div>
            </div>
            {c.description ? <p className="mt-2 text-sm text-ink-600">{c.description}</p> : null}

            <div className="mt-4 space-y-2">
              {c.isRecorded ? (
                c.sessions.filter((s) => s.recordingUrl).length === 0 ? (
                  <p className="text-sm text-ink-500">Recordings will appear here once published.</p>
                ) : (
                  c.sessions
                    .filter((s) => s.recordingUrl)
                    .map((s) => (
                      <a key={s.id} href={s.recordingUrl!} target="_blank" rel="noreferrer">
                        <Button variant="secondary" className="w-full justify-between">
                          <span>Watch recording · {fmt(s.startsAt, tz)}</span>
                          <span aria-hidden>↗</span>
                        </Button>
                      </a>
                    ))
                )
              ) : upcoming.length === 0 ? (
                <p className="text-sm text-ink-500">No upcoming sessions scheduled.</p>
              ) : (
                upcoming.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-col gap-2 rounded-lg border border-ink-100 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="text-sm font-semibold tabular-nums text-ink-800">
                      {fmt(s.startsAt, tz)}
                    </span>
                    {s.isLive && s.liveLink ? (
                      <a href={s.liveLink} target="_blank" rel="noreferrer">
                        <Button className="w-full sm:w-auto">Join live class</Button>
                      </a>
                    ) : s.isLive ? (
                      <Badge tone="warning">Live — link not posted yet</Badge>
                    ) : (
                      <Badge tone="neutral">Link opens when class starts</Badge>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>
        );
      })}
    </div>
    </PullToRefresh>
  );
}
