'use client';

import { useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import type { BookingSettingsRow, ClientClass } from '@/lib/admin-types';
import { Alert, Badge, Button, Card, EmptyState } from '@/components/ui';

function fmt(iso: string, tz?: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: tz,
  }).format(new Date(iso));
}

export function MyClasses() {
  const [classes, setClasses] = useState<ClientClass[] | null>(null);
  const [tz, setTz] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ classes: ClientClass[] }>('/api/my-classes')
      .then((d) => !cancelled && setClasses(d.classes))
      .catch((err: unknown) => {
        if (cancelled) return;
        setClasses([]);
        setError(err instanceof ApiClientError ? err.message : 'Could not load your classes');
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
  if (classes === null) return <p className="text-sm text-ink-500">Loading…</p>;
  if (classes.length === 0) {
    return (
      <EmptyState
        title="No classes yet"
        hint="Buy a class from the Shop and it will show up here automatically."
      />
    );
  }

  return (
    <div className="space-y-4">
      {classes.map((c) => {
        const upcoming = c.sessions.filter((s) => new Date(s.endsAt).getTime() >= Date.now());
        const liveNow = c.sessions.find((s) => s.isLive);
        return (
          <Card key={c.id}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold text-ink-900">{c.title}</span>
              <Badge tone={c.isRecorded ? 'neutral' : 'brand'}>
                {c.isRecorded ? 'Recorded' : 'Live'}
              </Badge>
              {liveNow ? <Badge tone="success">Live now</Badge> : null}
            </div>
            {c.instructorName ? (
              <p className="mt-1 text-sm text-ink-500">Coach: {c.instructorName}</p>
            ) : null}
            {c.description ? <p className="mt-1 text-sm text-ink-600">{c.description}</p> : null}

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
  );
}
