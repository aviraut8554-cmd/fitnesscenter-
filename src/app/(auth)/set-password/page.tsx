'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { Alert, Button, Card, Field, PageHeading } from '@/components/ui';

/**
 * Landing page for the emailed invite link. Supabase redirects here with the
 * session tokens in the URL (parsed automatically by the browser client), so an
 * invited member can set their own password — replacing the old temporary-
 * password flow.
 */
export default function SetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setReady(true);
      } else {
        setSessionError(
          'This invite link is invalid or has expired. Ask your team owner to resend it.',
        );
      }
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const supabase = createBrowserSupabase();
    const { error: updErr } = await supabase.auth.updateUser({ password });
    if (updErr) {
      setError(updErr.message);
      setLoading(false);
      return;
    }
    setDone(true);
    setLoading(false);
    setTimeout(() => {
      router.replace('/admin');
      router.refresh();
    }, 1200);
  }

  return (
    <Card>
      <PageHeading title="Set your password" subtitle="Finish setting up your team account" />
      {sessionError ? (
        <div className="space-y-4">
          <Alert>{sessionError}</Alert>
          <Link
            href="/login"
            className="block text-center text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            Go to login
          </Link>
        </div>
      ) : done ? (
        <Alert tone="info">Password set. Taking you to your dashboard…</Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <Field
            label="New password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            disabled={!ready}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Field
            label="Confirm password"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            disabled={!ready}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button type="submit" loading={loading} disabled={!ready} className="w-full">
            Set password
          </Button>
        </form>
      )}
    </Card>
  );
}
