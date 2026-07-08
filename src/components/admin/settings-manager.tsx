'use client';

import { useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import type { Branding, SettingsResponse } from '@/lib/admin-types';
import { formatMoney } from '@/lib/format';
import { Alert, Badge, Button, Card, Field } from '@/components/ui';

type TenantPatch = SettingsResponse['tenant'];

export function SettingsManager() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Editable fields
  const [name, setName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('');
  const [tagline, setTagline] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function hydrate(s: SettingsResponse) {
    setData(s);
    setName(s.tenant.name);
    setSubdomain(s.tenant.subdomain);
    setLogoUrl(s.tenant.branding.logoUrl ?? '');
    setPrimaryColor(s.tenant.branding.primaryColor ?? '');
    setTagline(s.tenant.branding.tagline ?? '');
  }

  useEffect(() => {
    let cancelled = false;
    api
      .get<SettingsResponse>('/api/settings')
      .then((s) => {
        if (!cancelled) hydrate(s);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof ApiClientError ? err.message : 'Could not load settings');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty =
    !!data &&
    (name !== data.tenant.name ||
      subdomain !== data.tenant.subdomain ||
      logoUrl !== (data.tenant.branding.logoUrl ?? '') ||
      primaryColor !== (data.tenant.branding.primaryColor ?? '') ||
      tagline !== (data.tenant.branding.tagline ?? ''));

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const branding: Branding = {};
      if (logoUrl) branding.logoUrl = logoUrl;
      if (primaryColor) branding.primaryColor = primaryColor;
      if (tagline) branding.tagline = tagline;
      const res = await api.put<{ tenant: TenantPatch }>('/api/settings', {
        name,
        subdomain,
        branding,
      });
      setData((prev) => (prev ? { ...prev, tenant: res.tenant } : prev));
      hydrate({ ...(data as SettingsResponse), tenant: res.tenant });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!data) return <p className="text-sm text-ink-500">Loading settings…</p>;

  const { plan, usage, razorpay } = data;
  const clientPct = plan ? Math.min(100, Math.round((usage.clientCount / plan.max_clients) * 100)) : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-500">
          Business profile
        </h2>
        <div className="space-y-4">
          <Field
            label="Business name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Peak Performance Gym"
          />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Subdomain</span>
            <div className="flex items-center gap-2">
              <input
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value.toLowerCase())}
                placeholder="peakgym"
                className="w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
              <span className="whitespace-nowrap text-sm text-ink-400">.fitnessos.app</span>
            </div>
            <span className="mt-1 block text-xs text-ink-400">
              Lowercase letters, digits and hyphens. Clients sign in at this address.
            </span>
          </label>
          <Field
            label="Logo URL"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://…/logo.png"
          />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Brand colour</span>
            <div className="flex items-center gap-3">
              <input
                type="color"
                aria-label="Brand colour"
                value={/^#[0-9a-fA-F]{6}$/.test(primaryColor) ? primaryColor : '#FF5A1F'}
                onChange={(e) => setPrimaryColor(e.target.value.toUpperCase())}
                className="h-10 w-14 cursor-pointer rounded-lg border border-ink-200 bg-white"
              />
              <input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value.toUpperCase())}
                placeholder="#FF5A1F"
                className="w-40 rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>
          </label>
          <Field
            label="Tagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="Train hard. Live well."
          />
          {error ? <Alert>{error}</Alert> : null}
          {saved && !dirty ? <Alert tone="info">Settings saved.</Alert> : null}
          <Button onClick={save} loading={saving} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      </Card>

      <div className="space-y-6">
        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-500">Plan</h2>
          {plan ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-ink-900">{plan.name}</span>
                <span className="text-sm font-semibold tabular-nums text-ink-700">
                  {formatMoney(plan.price_minor, plan.currency)}
                  <span className="text-ink-400">/mo</span>
                </span>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-ink-500">
                  <span>Clients</span>
                  <span className="tabular-nums">
                    {usage.clientCount} / {plan.max_clients}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${clientPct}%` }} />
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-ink-500">
                <span>Team members</span>
                <span className="tabular-nums">
                  {usage.teamCount} / {plan.max_team_members}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-500">No plan assigned. Contact sales to pick a tier.</p>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
            Payments
          </h2>
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-700">Razorpay</span>
            <Badge tone={razorpay.configured ? 'success' : 'warning'}>
              {razorpay.configured ? 'Connected' : 'Not configured'}
            </Badge>
          </div>
          <p className="mt-2 text-xs text-ink-400">
            {razorpay.configured
              ? 'Checkout and webhooks are live for this deployment.'
              : 'Payments run in test/off mode until Razorpay keys are configured for this deployment.'}
          </p>
        </Card>
      </div>
    </div>
  );
}
