'use client';

import { useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import {
  BILLING_CYCLE_LABELS,
  BILLING_CYCLES,
  type BillingCycle,
  type Offering,
  type OfferingSchedule,
  type TeamMember,
} from '@/lib/admin-types';
import { WEEKDAYS, type Weekday } from '@/lib/validation';
import { Alert, Button, Card, Field } from '@/components/ui';

const selectClass =
  'w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30';

const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

type BatchState = {
  id?: string;
  classType: 'live' | 'recorded';
  instructorId: string;
  capacity: string;
  days: Weekday[];
  startTime: string;
  endTime: string;
  accessLink: string;
  isDefault: boolean;
};

type FormState = {
  name: string;
  description: string;
  pricingType: 'paid' | 'free';
  amountMajor: string;
  currency: string;
  billingCycle: BillingCycle;
  isActive: boolean;
  batches: BatchState[];
  imageUrl: string;
  testimonial1: string;
  testimonial2: string;
  isBestseller: boolean;
  hasTrial: boolean;
  trialPriceMajor: string;
  trialDurationDays: string;
};

function emptyBatch(isDefault = false): BatchState {
  return {
    classType: 'live',
    instructorId: '',
    capacity: '',
    days: [],
    startTime: '',
    endTime: '',
    accessLink: '',
    isDefault,
  };
}

const EMPTY: FormState = {
  name: '',
  description: '',
  pricingType: 'paid',
  amountMajor: '',
  currency: 'INR',
  billingCycle: 'one_time',
  isActive: true,
  batches: [emptyBatch(true)],
  imageUrl: '',
  testimonial1: '',
  testimonial2: '',
  isBestseller: false,
  hasTrial: false,
  trialPriceMajor: '',
  trialDurationDays: '',
};

function fromOffering(o: Offering): FormState {
  const [t1 = '', t2 = ''] = o.testimonials ?? [];
  const batches: BatchState[] = (o.batches ?? []).map((b) => {
    const schedule = (b.schedule ?? {}) as OfferingSchedule;
    return {
      id: b.id,
      classType: b.is_recorded ? 'recorded' : 'live',
      instructorId: b.instructor_id ?? '',
      capacity: b.capacity != null ? String(b.capacity) : '',
      days: (schedule.days ?? []).filter((d): d is Weekday =>
        (WEEKDAYS as readonly string[]).includes(d),
      ),
      startTime: schedule.startTime ?? '',
      endTime: schedule.endTime ?? '',
      accessLink: schedule.accessLink ?? '',
      isDefault: b.id === o.default_class_id,
    };
  });
  if (batches.length === 0) batches.push(emptyBatch(true));
  if (!batches.some((b) => b.isDefault)) batches[0].isDefault = true;
  return {
    name: o.name,
    description: o.description ?? '',
    pricingType: (o.amount_minor ?? 0) === 0 ? 'free' : 'paid',
    amountMajor: o.amount_minor > 0 ? (o.amount_minor / 100).toString() : '',
    currency: o.currency ?? 'INR',
    billingCycle: (o.billing_cycle ?? 'one_time') as BillingCycle,
    isActive: o.is_active ?? true,
    batches,
    imageUrl: o.image_url ?? '',
    testimonial1: t1,
    testimonial2: t2,
    isBestseller: o.is_bestseller ?? false,
    hasTrial: o.has_trial ?? false,
    trialPriceMajor: o.trial_price_minor != null ? (o.trial_price_minor / 100).toString() : '',
    trialDurationDays: o.trial_duration_days != null ? String(o.trial_duration_days) : '',
  };
}

export function OfferingForm({
  instructors,
  editing,
  onDone,
  onCancel,
}: {
  instructors: TeamMember[];
  editing: Offering | null;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(editing ? fromOffering(editing) : EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateBatch(i: number, patch: Partial<BatchState>) {
    setForm((f) => ({
      ...f,
      batches: f.batches.map((b, idx) => (idx === i ? { ...b, ...patch } : b)),
    }));
  }

  function toggleDay(i: number, day: Weekday) {
    setForm((f) => ({
      ...f,
      batches: f.batches.map((b, idx) =>
        idx === i
          ? { ...b, days: b.days.includes(day) ? b.days.filter((d) => d !== day) : [...b.days, day] }
          : b,
      ),
    }));
  }

  function setDefaultBatch(i: number) {
    setForm((f) => ({
      ...f,
      batches: f.batches.map((b, idx) => ({ ...b, isDefault: idx === i })),
    }));
  }

  function addBatch() {
    setForm((f) => ({ ...f, batches: [...f.batches, emptyBatch(f.batches.length === 0)] }));
  }

  function removeBatch(i: number) {
    setForm((f) => {
      const batches = f.batches.filter((_, idx) => idx !== i);
      if (batches.length && !batches.some((b) => b.isDefault)) batches[0].isDefault = true;
      return { ...f, batches };
    });
  }

  async function save() {
    if (!form.name.trim()) {
      setError('Give the offering a name.');
      return;
    }
    if (form.batches.length === 0) {
      setError('Add at least one batch.');
      return;
    }
    const amountMinor =
      form.pricingType === 'free' ? 0 : Math.round(Number(form.amountMajor) * 100);
    if (form.pricingType === 'paid' && (!Number.isFinite(amountMinor) || amountMinor <= 0)) {
      setError('Enter a valid price, or mark the offering as free.');
      return;
    }
    const trialPriceMinor = form.trialPriceMajor
      ? Math.round(Number(form.trialPriceMajor) * 100)
      : null;

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      pricingType: form.pricingType,
      amountMinor,
      currency: form.currency.trim().toUpperCase() || 'INR',
      billingCycle: form.billingCycle,
      isActive: form.isActive,
      batches: form.batches.map((b) => ({
        id: b.id,
        classType: b.classType,
        instructorId: b.instructorId || undefined,
        capacity: b.capacity ? Number(b.capacity) : undefined,
        isDefault: b.isDefault,
        schedule: {
          days: b.days,
          startTime: b.startTime || undefined,
          endTime: b.endTime || undefined,
          accessLink: b.accessLink.trim() || undefined,
        },
      })),
      imageUrl: form.imageUrl.trim() || null,
      testimonials: [form.testimonial1, form.testimonial2].map((t) => t.trim()).filter(Boolean),
      isBestseller: form.isBestseller,
      hasTrial: form.hasTrial,
      trialPriceMinor: form.hasTrial ? trialPriceMinor : null,
      trialDurationDays:
        form.hasTrial && form.trialDurationDays ? Number(form.trialDurationDays) : null,
    };

    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await api.patch(`/api/offerings/${editing.id}`, payload);
      } else {
        await api.post('/api/offerings', payload);
      }
      await onDone();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save the offering');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-500">
        {editing ? 'Edit offering' : 'New offering'}
      </h2>

      <div className="space-y-4">
        <Field
          label="Name"
          name="name"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Description (optional)</span>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className={selectClass}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Pricing</span>
            <select
              value={form.pricingType}
              onChange={(e) => setForm({ ...form, pricingType: e.target.value as 'paid' | 'free' })}
              className={selectClass}
            >
              <option value="paid">Paid</option>
              <option value="free">Free</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">
              Subscription plan (billing)
            </span>
            <select
              value={form.billingCycle}
              onChange={(e) => setForm({ ...form, billingCycle: e.target.value as BillingCycle })}
              className={selectClass}
            >
              {BILLING_CYCLES.map((c) => (
                <option key={c} value={c}>
                  {BILLING_CYCLE_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          {form.pricingType === 'paid' ? (
            <>
              <Field
                label="Price (major units)"
                name="amount"
                type="number"
                min="0"
                step="0.01"
                value={form.amountMajor}
                onChange={(e) => setForm({ ...form, amountMajor: e.target.value })}
              />
              <Field
                label="Currency"
                name="currency"
                maxLength={3}
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              />
            </>
          ) : null}
        </div>

        <fieldset className="space-y-4 rounded-xl border border-ink-100 p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
            Batches
          </legend>
          <p className="text-xs text-ink-500">
            Add one batch per instructor/schedule. With 2+ batches, clients pick one after payment;
            the <span className="font-medium">Default</span> batch is auto-assigned if they don&apos;t
            choose within 24 hours.
          </p>

          {form.batches.map((b, i) => (
            <div key={i} className="space-y-3 rounded-lg border border-ink-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink-700">Batch {i + 1}</span>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 text-xs text-ink-600">
                    <input
                      type="radio"
                      name="defaultBatch"
                      checked={b.isDefault}
                      onChange={() => setDefaultBatch(i)}
                      className="h-3.5 w-3.5 text-brand-500 focus:ring-brand-500/30"
                    />
                    Default
                  </label>
                  {form.batches.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeBatch(i)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink-700">Type</span>
                  <select
                    value={b.classType}
                    onChange={(e) => updateBatch(i, { classType: e.target.value as 'live' | 'recorded' })}
                    className={selectClass}
                  >
                    <option value="live">Live</option>
                    <option value="recorded">Recorded</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink-700">Instructor</span>
                  <select
                    value={b.instructorId}
                    onChange={(e) => updateBatch(i, { instructorId: e.target.value })}
                    className={selectClass}
                  >
                    <option value="">Unassigned</option>
                    {instructors.map((m) => (
                      <option key={m.id} value={m.id}>
                        {(m.name || m.email || m.role) as string} ({m.role})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div>
                <span className="mb-1.5 block text-sm font-medium text-ink-700">Class days</span>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((d) => {
                    const on = b.days.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(i, d)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                          on ? 'bg-brand-500 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                        }`}
                      >
                        {WEEKDAY_LABELS[d]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field
                  label="Start time"
                  name={`start-${i}`}
                  type="time"
                  value={b.startTime}
                  onChange={(e) => updateBatch(i, { startTime: e.target.value })}
                />
                <Field
                  label="End time"
                  name={`end-${i}`}
                  type="time"
                  value={b.endTime}
                  onChange={(e) => updateBatch(i, { endTime: e.target.value })}
                />
                <Field
                  label="Capacity"
                  name={`cap-${i}`}
                  type="number"
                  min="1"
                  value={b.capacity}
                  onChange={(e) => updateBatch(i, { capacity: e.target.value })}
                />
              </div>

              <Field
                label="Access link (live meeting or recording)"
                name={`link-${i}`}
                type="url"
                placeholder="https://…"
                value={b.accessLink}
                onChange={(e) => updateBatch(i, { accessLink: e.target.value })}
              />
            </div>
          ))}

          <Button variant="secondary" onClick={addBatch}>
            + Add batch
          </Button>
        </fieldset>

        <fieldset className="space-y-4 rounded-xl border border-ink-100 p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
            Client-facing merchandising
          </legend>
          <Field
            label="Product image URL (shown in the store)"
            name="imageUrl"
            type="url"
            placeholder="https://…"
            value={form.imageUrl}
            onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Testimonial 1 (optional)"
              name="testimonial1"
              maxLength={280}
              value={form.testimonial1}
              onChange={(e) => setForm({ ...form, testimonial1: e.target.value })}
            />
            <Field
              label="Testimonial 2 (optional)"
              name="testimonial2"
              maxLength={280}
              value={form.testimonial2}
              onChange={(e) => setForm({ ...form, testimonial2: e.target.value })}
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={form.isBestseller}
              onChange={(e) => setForm({ ...form, isBestseller: e.target.checked })}
              className="h-4 w-4 rounded border-ink-300 text-brand-500 focus:ring-brand-500/30"
            />
            Mark as Bestseller / Most Popular
          </label>
          <div>
            <label className="inline-flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={form.hasTrial}
                onChange={(e) => setForm({ ...form, hasTrial: e.target.checked })}
                className="h-4 w-4 rounded border-ink-300 text-brand-500 focus:ring-brand-500/30"
              />
              Offer an intro / trial
            </label>
            {form.hasTrial ? (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Trial price (optional)"
                  name="trialPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.trialPriceMajor}
                  onChange={(e) => setForm({ ...form, trialPriceMajor: e.target.value })}
                />
                <Field
                  label="Trial duration in days (optional)"
                  name="trialDuration"
                  type="number"
                  min="1"
                  value={form.trialDurationDays}
                  onChange={(e) => setForm({ ...form, trialDurationDays: e.target.value })}
                />
              </div>
            ) : null}
          </div>
        </fieldset>

        <label className="inline-flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            className="h-4 w-4 rounded border-ink-300 text-brand-500 focus:ring-brand-500/30"
          />
          Active (visible to clients in the store)
        </label>

        {error ? <Alert>{error}</Alert> : null}

        <div className="flex gap-3">
          <Button onClick={save} loading={saving}>
            {editing ? 'Save changes' : 'Create offering'}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
}
