'use client';

import { useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import type {
  AutomationChannel,
  AutomationRule,
  AutomationTrigger,
  EmailProviderStatus,
} from '@/lib/admin-types';
import {
  AUTOMATION_TRIGGERS,
  DEFAULT_TEMPLATES,
  TRIGGER_LABELS,
  TRIGGER_VARIABLES,
  type Template,
} from '@/lib/automation-templates';
import { Alert, Badge, Button, Card } from '@/components/ui';

const CHANNELS: AutomationChannel[] = ['email', 'whatsapp'];
const CHANNEL_LABELS: Record<AutomationChannel, string> = { email: 'Email', whatsapp: 'WhatsApp' };

const inputClass =
  'w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30';

type AutomationResponse = { rules: AutomationRule[]; email: EmailProviderStatus };

function ruleKey(trigger: AutomationTrigger, channel: AutomationChannel): string {
  return `${trigger}:${channel}`;
}

function templateOf(rule: AutomationRule | undefined, trigger: AutomationTrigger): Template {
  const t = rule?.template as { subject?: unknown; body?: unknown } | null;
  if (t && typeof t.body === 'string') {
    return { subject: typeof t.subject === 'string' ? t.subject : undefined, body: t.body };
  }
  return DEFAULT_TEMPLATES[trigger];
}

export function AutomationsManager({ canManageEmail }: { canManageEmail: boolean }) {
  const [rules, setRules] = useState<AutomationRule[] | null>(null);
  const [email, setEmail] = useState<EmailProviderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [providerBusy, setProviderBusy] = useState<'connect' | 'disconnect' | 'test' | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [testRecipient, setTestRecipient] = useState('');

  function applyResponse(data: AutomationResponse) {
    setRules(data.rules);
    setEmail(data.email);
    setFromEmail(data.email.fromEmail ?? '');
    setFromName(data.email.fromName ?? '');
  }

  async function load() {
    try {
      const data = await api.get<AutomationResponse>('/api/automations');
      applyResponse(data);
      setError(null);
    } catch (err) {
      setRules([]);
      setError(err instanceof ApiClientError ? err.message : 'Could not load automations');
    }
  }

  useEffect(() => {
    let cancelled = false;
    api
      .get<AutomationResponse>('/api/automations')
      .then((data) => {
        if (cancelled) return;
        applyResponse(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRules([]);
        setError(err instanceof ApiClientError ? err.message : 'Could not load automations');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const byKey = new Map<string, AutomationRule>();
  for (const rule of rules ?? []) byKey.set(ruleKey(rule.trigger_type, rule.channel), rule);

  function openEditor(trigger: AutomationTrigger, channel: AutomationChannel) {
    const rule = byKey.get(ruleKey(trigger, channel));
    const template = templateOf(rule, trigger);
    setSubject(template.subject ?? '');
    setBody(template.body);
    setOpen(ruleKey(trigger, channel));
  }

  async function persist(
    trigger: AutomationTrigger,
    channel: AutomationChannel,
    patch: { enabled?: boolean; template?: Template },
  ) {
    const key = ruleKey(trigger, channel);
    const existing = byKey.get(key);
    const template = patch.template ?? templateOf(existing, trigger);
    setSaving(key);
    setError(null);
    setNotice(null);
    try {
      await api.put('/api/automations', {
        triggerType: trigger,
        channel,
        enabled: patch.enabled ?? existing?.enabled ?? false,
        template: { subject: template.subject || undefined, body: template.body },
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save automation');
    } finally {
      setSaving(null);
    }
  }

  async function saveTemplate(trigger: AutomationTrigger, channel: AutomationChannel) {
    if (!body.trim()) {
      setError('Message body cannot be empty.');
      return;
    }
    await persist(trigger, channel, {
      enabled: byKey.get(ruleKey(trigger, channel))?.enabled ?? true,
      template: { subject: subject.trim() || undefined, body: body.trim() },
    });
    setOpen(null);
  }

  async function connectEmail() {
    setProviderBusy('connect');
    setError(null);
    setNotice(null);
    try {
      const data = await api.put<{ email: EmailProviderStatus }>('/api/automations/email', {
        apiKey,
        fromEmail,
        fromName: fromName || undefined,
      });
      setEmail(data.email);
      setApiKey('');
      setShowConnect(false);
      setNotice('Resend connected. Send a test email before enabling automations.');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not connect Resend');
    } finally {
      setProviderBusy(null);
    }
  }

  async function disconnectEmail() {
    setProviderBusy('disconnect');
    setError(null);
    setNotice(null);
    try {
      const data = await api.del<{ email: EmailProviderStatus }>('/api/automations/email');
      setEmail(data.email);
      setApiKey('');
      setFromEmail(data.email.fromEmail ?? '');
      setFromName(data.email.fromName ?? '');
      setNotice(
        data.email.configured
          ? 'Tenant connection removed; deployment email configuration is now active.'
          : 'Resend disconnected and email automations were turned off.',
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not disconnect Resend');
    } finally {
      setProviderBusy(null);
    }
  }

  async function sendTestEmail() {
    setProviderBusy('test');
    setError(null);
    setNotice(null);
    try {
      await api.post('/api/automations/email', { recipient: testRecipient });
      setNotice(`Test email sent to ${testRecipient}.`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not send test email');
    } finally {
      setProviderBusy(null);
    }
  }

  if (rules === null || email === null) {
    return <p className="text-sm text-ink-500">Loading automations…</p>;
  }

  const connectionFormVisible = canManageEmail && (!email.configured || showConnect);

  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-500">
        Turn on automatic messages for key moments. Messages send by email and/or WhatsApp;
        reminders for classes, consultations and renewals run daily. Use{' '}
        <code className="rounded bg-ink-100 px-1 py-0.5 text-xs">{'{{tokens}}'}</code> to insert
        details.
      </p>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="info">{notice}</Alert> : null}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-ink-900">Email delivery</h2>
              <Badge tone={email.configured ? 'success' : 'warning'}>
                {email.configured ? 'Connected' : 'Not connected'}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-ink-500">
              Resend sends welcome messages, confirmations, and scheduled reminders from your
              business email. Verify your domain, then create an API key in{' '}
              <a
                href="https://resend.com/api-keys"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-brand-600 hover:underline"
              >
                Resend
              </a>
              .
            </p>
          </div>
          {email.configured && canManageEmail ? (
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              onClick={() => setShowConnect((value) => !value)}
            >
              {showConnect ? 'Cancel' : email.source === 'tenant' ? 'Replace connection' : 'Use my Resend account'}
            </Button>
          ) : null}
        </div>

        {email.configured ? (
          <div className="mt-4 rounded-lg border border-ink-100 bg-ink-50 p-3 text-sm text-ink-700">
            <p>
              Sending from{' '}
              <strong>{email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail}</strong>
            </p>
            <p className="mt-1 text-xs text-ink-400">
              {email.source === 'tenant' ? 'Connected for this business' : 'Configured for the deployment'}
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-amber-700">
            Email rules cannot be enabled until Resend is connected.
          </p>
        )}

        {connectionFormVisible ? (
          <div className="mt-4 grid gap-3 border-t border-ink-100 pt-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">Resend API key</span>
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="re_…"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">From email</span>
              <input
                type="email"
                value={fromEmail}
                onChange={(event) => setFromEmail(event.target.value)}
                placeholder="hello@yourdomain.com"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">Sender name</span>
              <input
                value={fromName}
                onChange={(event) => setFromName(event.target.value)}
                placeholder="Peak Performance Elite"
                className={inputClass}
              />
            </label>
            {!email.encryptionReady ? (
              <div className="md:col-span-2">
                <Alert>Secret storage is not configured for this deployment.</Alert>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button
                loading={providerBusy === 'connect'}
                disabled={!email.encryptionReady || !apiKey || !fromEmail}
                onClick={connectEmail}
              >
                Connect Resend
              </Button>
              {email.configured && showConnect ? (
                <Button variant="ghost" onClick={() => setShowConnect(false)}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {email.configured && canManageEmail ? (
          <div className="mt-4 space-y-3 border-t border-ink-100 pt-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">Send test email to</span>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="email"
                  value={testRecipient}
                  onChange={(event) => setTestRecipient(event.target.value)}
                  placeholder="you@example.com"
                  className={inputClass}
                />
                <Button
                  variant="secondary"
                  loading={providerBusy === 'test'}
                  disabled={!testRecipient}
                  onClick={sendTestEmail}
                >
                  Send test
                </Button>
              </div>
            </label>
            {email.source === 'tenant' ? (
              <Button
                variant="danger"
                loading={providerBusy === 'disconnect'}
                onClick={disconnectEmail}
              >
                Disconnect Resend
              </Button>
            ) : null}
          </div>
        ) : null}

        {!canManageEmail ? (
          <p className="mt-4 text-xs text-ink-400">Only the owner can change email provider settings.</p>
        ) : null}
      </Card>

      <div className="space-y-4">
        {AUTOMATION_TRIGGERS.map((trigger) => (
          <Card key={trigger}>
            <div>
              <h3 className="text-base font-bold text-ink-900">{TRIGGER_LABELS[trigger]}</h3>
              <p className="mt-1 text-xs text-ink-400">
                Tokens: {TRIGGER_VARIABLES[trigger].map((value) => `{{${value}}}`).join(', ')}
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {CHANNELS.map((channel) => {
                const key = ruleKey(trigger, channel);
                const rule = byKey.get(key);
                const enabled = rule?.enabled ?? false;
                const editing = open === key;
                const emailUnavailable = channel === 'email' && !email.configured;
                return (
                  <div key={channel} className="rounded-lg border border-ink-100 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink-800">
                          {CHANNEL_LABELS[channel]}
                        </span>
                        <Badge tone={enabled ? 'success' : 'neutral'}>{enabled ? 'On' : 'Off'}</Badge>
                        {emailUnavailable ? <Badge tone="warning">Not connected</Badge> : null}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          className="px-3 py-1.5 text-xs"
                          loading={saving === key}
                          disabled={emailUnavailable && !enabled}
                          onClick={() => persist(trigger, channel, { enabled: !enabled })}
                        >
                          {enabled ? 'Turn off' : 'Turn on'}
                        </Button>
                        <Button
                          variant="secondary"
                          className="px-3 py-1.5 text-xs"
                          onClick={() => (editing ? setOpen(null) : openEditor(trigger, channel))}
                        >
                          {editing ? 'Close' : 'Edit message'}
                        </Button>
                      </div>
                    </div>

                    {editing ? (
                      <div className="mt-3 space-y-3">
                        {channel === 'email' ? (
                          <label className="block">
                            <span className="mb-1.5 block text-sm font-medium text-ink-700">Subject</span>
                            <input
                              value={subject}
                              onChange={(event) => setSubject(event.target.value)}
                              className={inputClass}
                            />
                          </label>
                        ) : null}
                        <label className="block">
                          <span className="mb-1.5 block text-sm font-medium text-ink-700">Message</span>
                          <textarea
                            value={body}
                            onChange={(event) => setBody(event.target.value)}
                            rows={4}
                            className={inputClass}
                          />
                        </label>
                        <div className="flex gap-2">
                          <Button
                            className="px-3 py-1.5 text-xs"
                            loading={saving === key}
                            onClick={() => saveTemplate(trigger, channel)}
                          >
                            Save message
                          </Button>
                          <Button
                            variant="ghost"
                            className="px-3 py-1.5 text-xs"
                            onClick={() => setOpen(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
