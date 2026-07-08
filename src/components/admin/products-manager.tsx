'use client';

import { useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import {
  BILLING_CYCLE_LABELS,
  BILLING_CYCLES,
  PRODUCT_TYPE_LABELS,
  PRODUCT_TYPES,
  type BillingCycle,
  type Product,
  type ProductType,
  type TeamRole,
} from '@/lib/admin-types';
import { formatMoney } from '@/lib/format';
import {
  ActiveBadge,
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
} from '@/components/ui';

type FormState = {
  type: ProductType;
  name: string;
  description: string;
  amountMajor: string;
  currency: string;
  billingCycle: BillingCycle;
  capacity: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  type: 'course',
  name: '',
  description: '',
  amountMajor: '',
  currency: 'INR',
  billingCycle: 'one_time',
  capacity: '',
  isActive: true,
};

const selectClass =
  'w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30';

function toForm(p: Product): FormState {
  return {
    type: p.type,
    name: p.name,
    description: p.description ?? '',
    amountMajor: (p.amount_minor / 100).toString(),
    currency: p.currency,
    billingCycle: p.billing_cycle,
    capacity: p.capacity != null ? String(p.capacity) : '',
    isActive: p.is_active,
  };
}

export function ProductsManager({ viewerRole }: { viewerRole: TeamRole }) {
  const canWrite = viewerRole === 'owner' || viewerRole === 'manager';

  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(true);

  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api.get<{ products: Product[] }>('/api/products');
      setProducts(data.products);
      setError(null);
    } catch (err) {
      setProducts([]);
      setError(err instanceof ApiClientError ? err.message : 'Could not load products');
    }
  }

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ products: Product[] }>('/api/products')
      .then((data) => {
        if (cancelled) return;
        setProducts(data.products);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setProducts([]);
        setError(err instanceof ApiClientError ? err.message : 'Could not load products');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setCreating(true);
  }

  function openEdit(p: Product) {
    setCreating(false);
    setEditing(p);
    setForm(toForm(p));
    setFormError(null);
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
    setFormError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    const amountMinor = Math.round(Number(form.amountMajor) * 100);
    if (!Number.isFinite(amountMinor) || amountMinor < 0) {
      setFormError('Enter a valid price.');
      setSaving(false);
      return;
    }

    const payload = {
      type: form.type,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      amountMinor,
      currency: form.currency.trim().toUpperCase() || 'INR',
      billingCycle: form.billingCycle,
      capacity: form.capacity ? Number(form.capacity) : undefined,
      isActive: form.isActive,
    };

    try {
      if (editing) {
        await api.patch(`/api/products/${editing.id}`, payload);
      } else {
        await api.post('/api/products', payload);
      }
      closeForm();
      await load();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Could not save product');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: Product) {
    setError(null);
    try {
      await api.patch(`/api/products/${p.id}`, { isActive: !p.is_active });
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not update product');
    }
  }

  async function remove(p: Product) {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await api.del(`/api/products/${p.id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not delete product');
    }
  }

  const visible = (products ?? []).filter((p) => showInactive || p.is_active);
  const formOpen = creating || editing !== null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="inline-flex items-center gap-2 text-sm text-ink-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-ink-300 text-brand-500 focus:ring-brand-500/30"
          />
          Show inactive
        </label>
        {canWrite && !formOpen ? <Button onClick={openCreate}>New product</Button> : null}
      </div>

      {formOpen ? (
        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-ink-500">
            {editing ? 'Edit product' : 'New product'}
          </h2>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Name"
                name="name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink-700">Type</span>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as ProductType })}
                  className={selectClass}
                >
                  {PRODUCT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {PRODUCT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="Price (major units)"
                name="amount"
                type="number"
                min="0"
                step="0.01"
                required
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
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink-700">Billing cycle</span>
                <select
                  value={form.billingCycle}
                  onChange={(e) =>
                    setForm({ ...form, billingCycle: e.target.value as BillingCycle })
                  }
                  className={selectClass}
                >
                  {BILLING_CYCLES.map((c) => (
                    <option key={c} value={c}>
                      {BILLING_CYCLE_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="Capacity (optional)"
                name="capacity"
                type="number"
                min="1"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              />
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-700">
                Description (optional)
              </span>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className={selectClass}
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-ink-300 text-brand-500 focus:ring-brand-500/30"
              />
              Active (visible to clients)
            </label>
            {formError ? <Alert>{formError}</Alert> : null}
            <div className="flex gap-3">
              <Button type="submit" loading={saving}>
                {editing ? 'Save changes' : 'Create product'}
              </Button>
              <Button type="button" variant="secondary" onClick={closeForm}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {error ? <Alert>{error}</Alert> : null}

      {products === null ? (
        <p className="text-sm text-ink-500">Loading products…</p>
      ) : visible.length === 0 ? (
        <EmptyState
          title="No products yet"
          hint={
            canWrite
              ? 'Create your first course, class, consultation or merch item to sell.'
              : 'Your coach has not published any products yet.'
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => (
            <Card key={p.id} className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-2">
                <Badge tone="neutral">{PRODUCT_TYPE_LABELS[p.type]}</Badge>
                <ActiveBadge active={p.is_active} />
              </div>
              <h3 className="mt-3 text-base font-bold text-ink-900">{p.name}</h3>
              {p.description ? (
                <p className="mt-1 line-clamp-3 text-sm text-ink-500">{p.description}</p>
              ) : null}
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-xl font-bold tabular-nums text-ink-900">
                  {formatMoney(p.amount_minor, p.currency)}
                </span>
                <span className="text-xs text-ink-400">
                  {BILLING_CYCLE_LABELS[p.billing_cycle]}
                </span>
              </div>
              {p.capacity != null ? (
                <p className="mt-1 text-xs text-ink-400 tabular-nums">Capacity {p.capacity}</p>
              ) : null}
              {canWrite ? (
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => openEdit(p)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => toggleActive(p)}
                  >
                    {p.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button
                    variant="danger"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => remove(p)}
                  >
                    Delete
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
