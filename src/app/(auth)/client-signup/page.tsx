'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { Alert, Button, Card, Field, PageHeading } from '@/components/ui';

export default function ClientSignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ subdomain: '', fullName: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const email = form.email.trim().toLowerCase();
    try {
      await api.post('/api/auth/signup/client', {
        subdomain: form.subdomain.trim().toLowerCase(),
        fullName: form.fullName,
        email,
        password: form.password,
      });
      const supabase = createBrowserSupabase();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password: form.password,
      });
      if (authError) throw new Error(authError.message);
      router.replace('/app');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError || err instanceof Error ? err.message : 'Signup failed');
      setLoading(false);
    }
  }

  return (
    <Card>
      <PageHeading title="Join your coach" subtitle="Create your client account" />
      <form onSubmit={onSubmit} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <Field
          label="Coach subdomain"
          name="subdomain"
          required
          placeholder="yourcoach"
          value={form.subdomain}
          onChange={update('subdomain')}
        />
        <Field
          label="Full name"
          name="fullName"
          required
          value={form.fullName}
          onChange={update('fullName')}
        />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={update('email')}
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={form.password}
          onChange={update('password')}
        />
        <Button type="submit" loading={loading} className="w-full">
          Create account
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-ink-500">
        Already registered?{' '}
        <Link href="/client-login" className="font-semibold text-brand-600 hover:text-brand-700">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
