'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/client-errors';
import type { ClientClass, ClientSession } from '@/lib/admin-types';
import { Alert, Button, Card, Skeleton } from '@/components/ui';
import { BatchChooser } from '@/components/client/batch-chooser';

export type HomeHero = {
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaHref?: string;
};

const QUICK_ACTIONS = [
  { label: 'Shop plans', href: '/app/shop', desc: 'Browse and buy programs' },
  { label: 'My classes', href: '/app/classes', desc: 'Live sessions & recordings' },
  { label: 'My orders', href: '/app/orders', desc: 'Payments and invoices' },
  { label: 'Health form', href: '/app/health', desc: 'Keep your profile updated' },
];

function firstName(full: string): string {
  return full.split(/\s+/)[0] || full;
}

/** Human "in 3h" / "in 2 days" / "starting now" relative to a start time. */
function untilLabel(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return 'happening now';
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

function fmt(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

type NextSession = ClientSession & { classTitle: string };

type Summary = {
  activeClasses: number;
  upcomingCount: number;
  next: NextSession | null;
  nextLabel: string | null;
};

function summarize(classes: ClientClass[]): Summary {
  const now = Date.now();
  const upcoming = classes
    .flatMap((c) => c.sessions.map((s) => ({ ...s, classTitle: c.title })))
    .filter((s) => new Date(s.endsAt).getTime() >= now)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const next = upcoming[0] ?? null;
  return {
    activeClasses: classes.length,
    upcomingCount: upcoming.length,
    next,
    nextLabel: next ? untilLabel(next.startsAt) : null,
  };
}

export function ClientHome({ fullName, hero }: { fullName: string; hero: HomeHero }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ classes: ClientClass[] }>('/api/my-classes')
      .then((d) => !cancelled && setSummary(summarize(d.classes)))
      .catch((err: unknown) => {
        if (cancelled) return;
        setSummary({ activeClasses: 0, upcomingCount: 0, next: null, nextLabel: null });
        setError(friendlyError(err, 'Could not load your classes'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const next = summary?.next ?? null;

  const ctaHref = hero.ctaHref || '/app/shop';
  const ctaLabel = hero.ctaLabel || 'Browse plans';
  const title = hero.title || "Let's get to work.";
  const subtitle = hero.subtitle || 'Your training, classes and progress — all in one place.';
  const isExternal = /^https?:\/\//.test(ctaHref);

  return (
    <div className="space-y-4">
      {/* Hero / momentum banner */}
      <div className="relative overflow-hidden rounded-2xl bg-ink-900 p-5 text-white">
        {hero.imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={hero.imageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/30" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-brand-600 via-ink-900 to-ink-900" />
        )}
        <div className="relative">
          <p className="text-sm font-medium text-white/80">Hi, {firstName(fullName)} 👋</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight">{title}</h1>
          <p className="mt-1 max-w-sm text-sm text-white/80">{subtitle}</p>
          {isExternal ? (
            <a href={ctaHref} target="_blank" rel="noreferrer" className="mt-4 inline-block">
              <Button className="rounded-full">{ctaLabel}</Button>
            </a>
          ) : (
            <Link href={ctaHref} className="mt-4 inline-block">
              <Button className="rounded-full">{ctaLabel}</Button>
            </Link>
          )}
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {/* Momentum stats */}
      {summary === null ? (
        <Skeleton className="h-20 w-full" />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <p className="text-2xl font-bold tabular-nums text-ink-900">{summary.activeClasses}</p>
            <p className="text-xs text-ink-500">
              Active {summary.activeClasses === 1 ? 'class' : 'classes'}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-2xl font-bold tabular-nums text-ink-900">{summary.upcomingCount}</p>
            <p className="text-xs text-ink-500">
              Upcoming session{summary.upcomingCount === 1 ? '' : 's'}
            </p>
          </Card>
        </div>
      )}

      {/* Batch selection prompt for any paid-but-unpicked order */}
      <BatchChooser onResolved={() => undefined} />

      {/* Next session */}
      {summary === null ? (
        <Skeleton className="h-28 w-full" />
      ) : next ? (
        <Card className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            Next session · {summary.nextLabel}
          </p>
          <p className="text-base font-bold text-ink-900">{next.classTitle}</p>
          <p className="text-sm tabular-nums text-ink-500">{fmt(next.startsAt)}</p>
          {next.isLive && next.liveLink ? (
            <a href={next.liveLink} target="_blank" rel="noreferrer" className="block pt-1">
              <Button className="w-full rounded-full">Join live</Button>
            </a>
          ) : (
            <Link href="/app/classes" className="block pt-1">
              <Button variant="secondary" className="w-full rounded-full">
                View classes
              </Button>
            </Link>
          )}
        </Card>
      ) : null}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        {QUICK_ACTIONS.map((t) => (
          <Link key={t.href} href={t.href}>
            <Card className="h-full p-4 transition-shadow active:scale-[0.98] hover:shadow-md">
              <h3 className="text-sm font-bold text-ink-900">{t.label}</h3>
              <p className="mt-1 text-xs text-ink-500">{t.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
