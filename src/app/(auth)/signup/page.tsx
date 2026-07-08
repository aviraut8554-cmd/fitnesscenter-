'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { Alert, Button, Card, Field, PageHeading } from '@/components/ui';

export default function CreatorSignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    tenantName: '',
    subdomain: '',
    email: '',
    password: '',
  });
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
      await api.post('/api/auth/signup/influencer', {
        name: form.name,
        tenantName: form.tenantName,
        subdomain: form.subdomain.trim().toLowerCase(),
        email,
        password: form.password,
      });
      const supabase = createBrowserSupabase();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password: form.password,
      });
      if (authError) throw new Error(authError.message);
      router.replace('/admin');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError || err instanceof Error ? err.message : 'Signup failed');
      setLoading(false);
    }
  }

  return (
    <Card>
      <PageHeading title="Create your account" subtitle="Set up your fitness business in a minute" />
      <form onSubmit={onSubmit} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <Field label="Your name" name="name" required value={form.name} onChange={update('name')} />
        <Field
          label="Business name"
          name="tenantName"
          required
          value={form.tenantName}
          onChange={update('tenantName')}
        />
        <Field
          label="Subdomain"
          name="subdomain"
          required
          placeholder="yourbrand"
          value={form.subdomain}
          onChange={update('subdomain')}
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
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
