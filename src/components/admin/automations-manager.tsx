'use client';

import { useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import type { AutomationChannel, AutomationRule, AutomationTrigger } from '@/lib/admin-types';
import {
  AUTOMATION_TRIGGERS,
  DEFAULT_TEMPLATES,
  TRIGGER_LABELS,
  TRIGGER_VARIABLES,
  type Template,
} from '@/lib/automation';
import { Alert, Badge, Button, Card } from '@/components/ui';

const CHANNELS: AutomationChannel[] = ['email', 'whatsapp'];
const CHANNEL_LABELS: Record<AutomationChannel, string> = { email: 'Email', whatsapp: 'WhatsApp' };

const inputClass =
  'w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30';

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

export function AutomationsManager() {
  const [rules, setRules] = useState<AutomationRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api.get<{ rules: AutomationRule[] }>('/api/automations');
      setRules(data.rules);
      setError(null);
    } catch (err) {
      setRules([]);
      setError(err instanceof ApiClientError ? err.message : 'Could not load automations');
    }
  }

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ rules: AutomationRule[] }>('/api/automations')
      .then((data) => {
        if (cancelled) return;
        setRules(data.rules);
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
  for (const r of rules ?? []) byKey.set(ruleKey(r.trigger_type, r.channel), r);

  function openEditor(trigger: AutomationTrigger, channel: AutomationChannel) {
    const rule = byKey.get(ruleKey(trigger, channel));
    const tpl = templateOf(rule, trigger);
    setSubject(tpl.subject ?? '');
    setBody(tpl.body);
    setOpen(ruleKey(trigger, channel));
  }

  async function persist(
    trigger: AutomationTrigger,
    channel: AutomationChannel,
    patch: { enabled?: boolean; template?: Template },
  ) {
    const key = ruleKey(trigger, channel);
    const existing = byKey.get(key);
    const tpl = patch.template ?? templateOf(existing, trigger);
    setSaving(key);
    setError(null);
    try {
      await api.put('/api/automations', {
        triggerType: trigger,
        channel,
        enabled: patch.enabled ?? existing?.enabled ?? false,
        template: { subject: tpl.subject || undefined, body: tpl.body },
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

  if (rules === null) return <p className="text-sm text-ink-500">Loading automations…</p>;

  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-500">
        Turn on automatic messages for key moments. Messages send by email and/or WhatsApp;
        reminders for classes, consultations and renewals run daily. Use{' '}
        <code className="rounded bg-ink-100 px-1 py-0.5 text-xs">{'{{tokens}}'}</code> to insert
        details.
      </p>

      {error ? <Alert>{error}</Alert> : null}

      <div className="space-y-4">
        {AUTOMATION_TRIGGERS.map((trigger) => (
          <Card key={trigger}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-ink-900">{TRIGGER_LABELS[trigger]}</h3>
                <p className="mt-1 text-xs text-ink-400">
                  Tokens: {TRIGGER_VARIABLES[trigger].map((v) => `{{${v}}}`).join(', ')}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {CHANNELS.map((channel) => {
                const key = ruleKey(trigger, channel);
                const rule = byKey.get(key);
                const enabled = rule?.enabled ?? false;
                const editing = open === key;
                return (
                  <div key={channel} className="rounded-lg border border-ink-100 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink-800">
                          {CHANNEL_LABELS[channel]}
                        </span>
                        <Badge tone={enabled ? 'success' : 'neutral'}>
                          {enabled ? 'On' : 'Off'}
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          className="px-3 py-1.5 text-xs"
                          loading={saving === key}
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
                            <span className="mb-1.5 block text-sm font-medium text-ink-700">
                              Subject
                            </span>
                            <input
                              value={subject}
                              onChange={(e) => setSubject(e.target.value)}
                              className={inputClass}
                            />
                          </label>
                        ) : null}
                        <label className="block">
                          <span className="mb-1.5 block text-sm font-medium text-ink-700">
                            Message
                          </span>
                          <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
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
