'use client';

import { useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import type { Branding, RazorpayStatus, SettingsResponse } from '@/lib/admin-types';
import { formatMoney } from '@/lib/format';
import { Alert, Badge, Button, Card, Field } from '@/components/ui';
import { ImageUploadField } from '@/components/admin/image-upload-field';

type TenantPatch = SettingsResponse['tenant'];

const HERO_LINK_PRESETS = ['/app/shop', '/app/book', '/app/classes', '/app/health'];

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
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [heroTitle, setHeroTitle] = useState('');
  const [heroSubtitle, setHeroSubtitle] = useState('');
  const [heroCtaLabel, setHeroCtaLabel] = useState('');
  const [heroCtaHref, setHeroCtaHref] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function hydrate(s: SettingsResponse) {
    setData(s);
    setName(s.tenant.name);
    setSubdomain(s.tenant.subdomain);
    setLogoUrl(s.tenant.branding.logoUrl ?? '');
    setPrimaryColor(s.tenant.branding.primaryColor ?? '');
    setTagline(s.tenant.branding.tagline ?? '');
    setHeroImageUrl(s.tenant.branding.heroImageUrl ?? '');
    setHeroTitle(s.tenant.branding.heroTitle ?? '');
    setHeroSubtitle(s.tenant.branding.heroSubtitle ?? '');
    setHeroCtaLabel(s.tenant.branding.heroCtaLabel ?? '');
    setHeroCtaHref(s.tenant.branding.heroCtaHref ?? '');
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
      tagline !== (data.tenant.branding.tagline ?? '') ||
      heroImageUrl !== (data.tenant.branding.heroImageUrl ?? '') ||
      heroTitle !== (data.tenant.branding.heroTitle ?? '') ||
      heroSubtitle !== (data.tenant.branding.heroSubtitle ?? '') ||
      heroCtaLabel !== (data.tenant.branding.heroCtaLabel ?? '') ||
      heroCtaHref !== (data.tenant.branding.heroCtaHref ?? ''));

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const branding: Branding = {};
      if (logoUrl) branding.logoUrl = logoUrl;
      if (primaryColor) branding.primaryColor = primaryColor;
      if (tagline) branding.tagline = tagline;
      if (heroImageUrl) branding.heroImageUrl = heroImageUrl;
      if (heroTitle) branding.heroTitle = heroTitle;
      if (heroSubtitle) branding.heroSubtitle = heroSubtitle;
      if (heroCtaLabel) branding.heroCtaLabel = heroCtaLabel;
      if (heroCtaHref) branding.heroCtaHref = heroCtaHref;
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
          <ImageUploadField
            label="Logo URL"
            value={logoUrl}
            onValueChange={setLogoUrl}
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

          <div className="space-y-4 border-t border-ink-100 pt-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
                Client home hero
              </h3>
              <p className="mt-1 text-xs text-ink-400">
                The banner clients see at the top of their app home. Leave blank for a default.
              </p>
            </div>
            <ImageUploadField
              label="Hero image URL"
              value={heroImageUrl}
              onValueChange={setHeroImageUrl}
              placeholder="https://…/banner.jpg"
            />
            <Field
              label="Headline"
              value={heroTitle}
              onChange={(e) => setHeroTitle(e.target.value)}
              placeholder="Let's get to work."
            />
            <Field
              label="Subtext"
              value={heroSubtitle}
              onChange={(e) => setHeroSubtitle(e.target.value)}
              placeholder="Your training, classes and progress — all in one place."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Button label"
                value={heroCtaLabel}
                onChange={(e) => setHeroCtaLabel(e.target.value)}
                placeholder="Browse plans"
              />
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink-700">Button link</span>
                <select
                  value={HERO_LINK_PRESETS.includes(heroCtaHref) ? heroCtaHref : 'custom'}
                  onChange={(e) =>
                    setHeroCtaHref(e.target.value === 'custom' ? '' : e.target.value)
                  }
                  className="w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                >
                  <option value="/app/shop">Shop</option>
                  <option value="/app/book">Book a consultation</option>
                  <option value="/app/classes">Classes</option>
                  <option value="/app/health">Health &amp; progress</option>
                  <option value="custom">Custom URL…</option>
                </select>
              </label>
            </div>
            {!HERO_LINK_PRESETS.includes(heroCtaHref) ? (
              <Field
                label="Custom link"
                value={heroCtaHref}
                onChange={(e) => setHeroCtaHref(e.target.value)}
                placeholder="/app/shop or https://…"
              />
            ) : null}
          </div>

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

        <RazorpayCard
          tenantId={data.tenant.id}
          status={razorpay}
          onChange={(s) => setData((prev) => (prev ? { ...prev, razorpay: s } : prev))}
        />
      </div>
    </div>
  );
}

function statusBadge(status: RazorpayStatus): { tone: 'success' | 'warning' | 'neutral'; label: string } {
  if (status.source === 'tenant') return { tone: 'success', label: 'Connected' };
  if (status.source === 'env') return { tone: 'neutral', label: 'Using deployment keys' };
  return { tone: 'warning', label: 'Not configured' };
}

/**
 * Self-service Razorpay connection. The owner pastes their Key ID, Key Secret
 * and Webhook Secret; secrets are sent once to the server (encrypted at rest)
 * and never returned. Shows the tenant-specific webhook URL to paste into the
 * Razorpay dashboard, and a Disconnect action.
 */
function RazorpayCard({
  tenantId,
  status,
  onChange,
}: {
  tenantId: string;
  status: RazorpayStatus;
  onChange: (s: RazorpayStatus) => void;
}) {
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const badge = statusBadge(status);
  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/payments/webhook/${tenantId}`
      : `/api/payments/webhook/${tenantId}`;
  const canSubmit = Boolean(keyId && keySecret && webhookSecret) && status.encryptionReady;

  async function connect() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await api.put<{ razorpay: RazorpayStatus }>('/api/settings/razorpay', {
        keyId: keyId.trim(),
        keySecret: keySecret.trim(),
        webhookSecret: webhookSecret.trim(),
      });
      onChange(res.razorpay);
      setKeyId('');
      setKeySecret('');
      setWebhookSecret('');
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save Razorpay keys');
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    setError(null);
    setSaved(false);
    try {
      const res = await api.del<{ razorpay: RazorpayStatus }>('/api/settings/razorpay');
      onChange(res.razorpay);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not disconnect Razorpay');
    } finally {
      setDisconnecting(false);
    }
  }

  async function copyWebhook() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable; the URL is visible for manual copy.
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">Payments</h2>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-700">Razorpay</span>
          {status.configured ? (
            <span className="tabular-nums text-ink-500">
              {status.keyIdMasked}
              {status.mode ? (
                <span className="ml-2">
                  <Badge tone={status.mode === 'live' ? 'success' : 'neutral'}>{status.mode}</Badge>
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-ink-400">No account connected</span>
          )}
        </div>

        {status.source === 'env' ? (
          <p className="text-xs text-ink-400">
            Currently using the deployment&rsquo;s shared keys. Connect your own account below to
            receive payments directly.
          </p>
        ) : null}

        {!status.encryptionReady ? (
          <Alert>
            Storing keys is disabled until <code>SETTINGS_ENCRYPTION_KEY</code> is set on the
            server.
          </Alert>
        ) : null}

        <div className="space-y-3 border-t border-ink-100 pt-4">
          <Field
            label="Key ID"
            value={keyId}
            onChange={(e) => setKeyId(e.target.value)}
            placeholder="rzp_test_XXXXXXXXXXXXXX"
          />
          <Field
            label="Key Secret"
            type="password"
            value={keySecret}
            onChange={(e) => setKeySecret(e.target.value)}
            placeholder="Never shown again after saving"
          />
          <Field
            label="Webhook Secret"
            type="password"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder="The secret you set on the webhook"
          />
          {error ? <Alert>{error}</Alert> : null}
          {saved ? <Alert tone="info">Razorpay account connected.</Alert> : null}
          <div className="flex items-center gap-2">
            <Button onClick={connect} loading={saving} disabled={!canSubmit}>
              {status.source === 'tenant' ? 'Update keys' : 'Connect Razorpay'}
            </Button>
            {status.source === 'tenant' ? (
              <Button variant="ghost" onClick={disconnect} loading={disconnecting}>
                Disconnect
              </Button>
            ) : null}
          </div>
        </div>

        <div className="border-t border-ink-100 pt-4">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Webhook URL</span>
          <p className="mb-2 text-xs text-ink-400">
            Add this URL in Razorpay → Settings → Webhooks, subscribe to <code>payment.captured</code>,{' '}
            <code>payment.failed</code> and <code>refund.processed</code>, and set the same webhook
            secret you entered above.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={webhookUrl}
              className="w-full rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-xs text-ink-700"
            />
            <Button variant="ghost" onClick={copyWebhook}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
