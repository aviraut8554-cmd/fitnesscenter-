'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { friendlyError } from '@/lib/client-errors';
import { PRODUCT_TYPE_LABELS, type OrderWithRelations } from '@/lib/admin-types';
import { formatMoney } from '@/lib/format';
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  InvoiceStatusBadge,
  OrderStatusBadge,
} from '@/components/ui';

export function ClientOrders() {
  const [orders, setOrders] = useState<OrderWithRelations[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ orders: OrderWithRelations[] }>('/api/orders')
      .then((data) => {
        if (cancelled) return;
        setOrders(data.orders);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setOrders([]);
        setError(friendlyError(err, 'Could not load your orders'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}

      {orders === null ? (
        <p className="text-sm text-ink-500">Loading orders…</p>
      ) : orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          hint="Programs you buy from the store show up here with their invoices."
        />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const invoice = order.invoices?.[0];
            return (
              <Card key={order.id} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {order.product ? (
                      <Badge tone="neutral">{PRODUCT_TYPE_LABELS[order.product.type]}</Badge>
                    ) : null}
                    <h3 className="mt-2 text-base font-bold text-ink-900">
                      {order.product?.name ?? 'Order'}
                    </h3>
                  </div>
                  <OrderStatusBadge status={order.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold tabular-nums text-ink-900">
                    {formatMoney(order.amount_minor, order.currency)}
                  </span>
                  <span className="text-xs text-ink-400 tabular-nums">
                    {new Date(order.created_at).toLocaleDateString()}
                  </span>
                </div>
                {invoice ? (
                  <div className="flex items-center gap-2 border-t border-ink-100 pt-2 text-xs text-ink-500">
                    <span className="tabular-nums">Invoice {invoice.number}</span>
                    <InvoiceStatusBadge status={invoice.status} />
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
