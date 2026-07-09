'use client';

import { useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import {
  BILLING_CYCLE_LABELS,
  PRODUCT_TYPE_LABELS,
  type Order,
  type OrderCheckout,
  type Product,
} from '@/lib/admin-types';
import { formatMoney } from '@/lib/format';
import { Alert, Badge, Button, Card, EmptyState } from '@/components/ui';
import { BatchChooser } from '@/components/client/batch-chooser';

const RAZORPAY_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

type RazorpayHandlerResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  handler: (response: RazorpayHandlerResponse) => void;
  modal?: { ondismiss?: () => void };
  theme?: { color?: string };
};

type RazorpayInstance = { open: () => void };

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function ClientShop() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  // Bumped after a payment to re-check for a batch the buyer must choose.
  const [chooserKey, setChooserKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ products: Product[] }>('/api/products?active=true')
      .then((data) => {
        if (cancelled) return;
        setProducts(data.products);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setProducts([]);
        setError(err instanceof ApiClientError ? err.message : 'Could not load the store');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function buy(product: Product) {
    setBuying(product.id);
    setError(null);
    setNotice(null);
    try {
      const { order, checkout } = await api.post<{ order: Order; checkout: OrderCheckout }>(
        '/api/orders',
        { productId: product.id },
      );

      const ready = await loadRazorpay();
      if (!ready || !window.Razorpay) {
        setError('Could not load the payment window. Check your connection and try again.');
        return;
      }

      const rzp = new window.Razorpay({
        key: checkout.keyId,
        amount: checkout.amountMinor,
        currency: checkout.currency,
        name: product.name,
        description: PRODUCT_TYPE_LABELS[product.type],
        order_id: checkout.razorpayOrderId,
        theme: { color: '#FF5A1F' },
        handler: () => {
          setNotice(
            `Payment received for "${product.name}". If it has multiple batches, choose one below.`,
          );
          // The webhook marks the order paid a moment later; re-check a few
          // times so the "choose your batch" prompt appears once it lands.
          let tries = 0;
          const timer = setInterval(() => {
            tries += 1;
            setChooserKey((k) => k + 1);
            if (tries >= 5) clearInterval(timer);
          }, 2000);
        },
        modal: {
          ondismiss: () => {
            setNotice(`Checkout closed. Order ${order.receipt ?? ''} is awaiting payment.`);
          },
        },
      });
      rzp.open();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not start checkout');
    } finally {
      setBuying(null);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="info">{notice}</Alert> : null}

      <BatchChooser key={chooserKey} onResolved={() => setNotice('You’re in! See it under Classes.')} />


      {products === null ? (
        <p className="text-sm text-ink-500">Loading store…</p>
      ) : products.length === 0 ? (
        <EmptyState
          title="Nothing for sale yet"
          hint="Your coach has not published any programs. Check back soon."
        />
      ) : (
        <div className="space-y-3">
          {products.map((p) => (
            <Card key={p.id} className="flex flex-col gap-3 overflow-hidden">
              {p.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.image_url}
                  alt={p.name}
                  className="-mx-5 -mt-5 mb-1 h-40 w-[calc(100%+2.5rem)] object-cover"
                />
              ) : null}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{PRODUCT_TYPE_LABELS[p.type]}</Badge>
                    {p.is_bestseller ? <Badge tone="warning">Bestseller</Badge> : null}
                  </div>
                  <h3 className="mt-2 text-base font-bold text-ink-900">{p.name}</h3>
                  {p.description ? (
                    <p className="mt-1 text-sm text-ink-500">{p.description}</p>
                  ) : null}
                </div>
              </div>
              {(p.testimonials ?? []).length > 0 ? (
                <div className="space-y-1.5">
                  {p.testimonials.map((t, i) => (
                    <p
                      key={i}
                      className="border-l-2 border-brand-300 pl-2.5 text-xs italic text-ink-600"
                    >
                      {t}
                    </p>
                  ))}
                </div>
              ) : null}
              {p.has_trial ? (
                <p className="text-xs font-medium text-brand-600">
                  {p.trial_price_minor != null
                    ? `Intro offer: ${formatMoney(p.trial_price_minor, p.currency)}`
                    : 'Intro / trial offer available'}
                  {p.trial_duration_days != null ? ` · ${p.trial_duration_days}-day trial` : ''}
                </p>
              ) : null}
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold tabular-nums text-ink-900">
                    {formatMoney(p.amount_minor, p.currency)}
                  </span>
                  <span className="text-xs text-ink-400">
                    {BILLING_CYCLE_LABELS[p.billing_cycle]}
                  </span>
                </div>
                <Button loading={buying === p.id} onClick={() => buy(p)}>
                  Buy now
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
