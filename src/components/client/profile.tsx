'use client';

import { useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import type { MeResponse } from '@/lib/admin-types';
import { Alert, Button, Card, Field } from '@/components/ui';

type Me = MeResponse['client'];

export function ClientProfileForm() {
  const [me, setMe] = useState<Me | null>(null);
  const [coach, setCoach] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<MeResponse>('/api/me')
      .then((data) => {
        if (cancelled) return;
        setMe(data.client);
        setCoach(data.tenant?.name ?? null);
        setFullName(data.client.full_name);
        setPhone(data.client.phone ?? '');
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof ApiClientError ? err.message : 'Could not load your profile');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = !!me && (fullName !== me.full_name || phone !== (me.phone ?? ''));

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await api.patch<{ client: Me }>('/api/me', {
        fullName,
        phone: phone || undefined,
      });
      setMe(res.client);
      setFullName(res.client.full_name);
      setPhone(res.client.phone ?? '');
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save your profile');
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!me) return <p className="text-sm text-ink-500">Loading profile…</p>;

  return (
    <Card className="space-y-4">
      <div>
        <p className="text-xs text-ink-400">Signed in as</p>
        <p className="text-sm font-medium text-ink-900">{me.email ?? '—'}</p>
        {coach ? <p className="mt-1 text-xs text-ink-400">Coach: {coach}</p> : null}
      </div>
      <Field label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      <Field
        label="Phone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+91 98765 43210"
      />
      {error ? <Alert>{error}</Alert> : null}
      {saved && !dirty ? <Alert tone="info">Profile saved.</Alert> : null}
      <Button onClick={save} loading={saving} disabled={!dirty}>
        Save changes
      </Button>
    </Card>
  );
}
