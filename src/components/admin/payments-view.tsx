'use client';

import { useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import type { OrderWithRelations, RevenueSummary } from '@/lib/admin-types';
import { formatMoney } from '@/lib/format';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  InvoiceStatusBadge,
  OrderStatusBadge,
  Table,
} from '@/components/ui';

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-ink-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-400 tabular-nums">{hint}</p> : null}
    </Card>
  );
}

export function PaymentsView() {
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [orders, setOrders] = useState<OrderWithRelations[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<string | null>(null);

  async function load() {
    try {
      const [rev, ord] = await Promise.all([
        api.get<{ revenue: RevenueSummary }>('/api/revenue'),
        api.get<{ orders: OrderWithRelations[] }>('/api/orders'),
      ]);
      setRevenue(rev.revenue);
      setOrders(ord.orders);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not load payments');
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<{ revenue: RevenueSummary }>('/api/revenue'),
      api.get<{ orders: OrderWithRelations[] }>('/api/orders'),
    ])
      .then(([rev, ord]) => {
        if (cancelled) return;
        setRevenue(rev.revenue);
        setOrders(ord.orders);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiClientError ? err.message : 'Could not load payments');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function refund(order: OrderWithRelations) {
    if (!confirm(`Refund the full amount for order ${order.receipt ?? order.id.slice(0, 8)}?`)) {
      return;
    }
    setRefunding(order.id);
    setError(null);
    try {
      await api.post(`/api/orders/${order.id}/refund`, {});
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not initiate refund');
    } finally {
      setRefunding(null);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <Alert>{error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Net revenue"
          value={revenue ? formatMoney(revenue.netMinor, revenue.currency) : '—'}
          hint={revenue ? `${revenue.capturedCount} captured` : undefined}
        />
        <StatCard
          label="Gross"
          value={revenue ? formatMoney(revenue.grossMinor, revenue.currency) : '—'}
        />
        <StatCard
          label="Refunded"
          value={revenue ? formatMoney(revenue.refundedMinor, revenue.currency) : '—'}
          hint={revenue ? `${revenue.refundedCount} refunds` : undefined}
        />
        <StatCard
          label="Failed"
          value={revenue ? String(revenue.failedCount) : '—'}
          hint="payments"
        />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
          Transactions
        </h2>
        {orders === null ? (
          <p className="text-sm text-ink-500">Loading orders…</p>
        ) : orders.length === 0 ? (
          <EmptyState
            title="No orders yet"
            hint="Orders appear here once clients check out through your store."
          />
        ) : (
          <Table
            head={
              <tr>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            }
          >
            {orders.map((order) => {
              const invoice = order.invoices?.[0];
              const refundable =
                order.status === 'paid' || order.status === 'partially_refunded';
              return (
                <tr key={order.id} className="hover:bg-ink-50">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink-900">
                      {order.client?.full_name ?? 'Unknown'}
                    </div>
                    {order.client?.email ? (
                      <div className="text-xs text-ink-500">{order.client.email}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-ink-600">{order.product?.name ?? '—'}</td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-ink-900">
                    {formatMoney(order.amount_minor, order.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3">
                    {invoice ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs tabular-nums text-ink-600">{invoice.number}</span>
                        <InvoiceStatusBadge status={invoice.status} />
                      </div>
                    ) : (
                      <span className="text-xs text-ink-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-500 tabular-nums">
                    {new Date(order.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {refundable ? (
                      <Button
                        variant="danger"
                        className="px-2.5 py-1.5 text-xs"
                        loading={refunding === order.id}
                        onClick={() => refund(order)}
                      >
                        Refund
                      </Button>
                    ) : (
                      <span className="text-xs text-ink-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </div>
    </div>
  );
}
