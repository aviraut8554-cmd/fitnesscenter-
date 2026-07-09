import { resolveInstructorNames } from '@/lib/class-service';
import type { AdminSupabase } from '@/lib/supabase/admin';

/** How long a buyer has to pick a batch before one is auto-assigned. */
export const BATCH_SELECTION_WINDOW_MS = 24 * 60 * 60 * 1000;

export type BatchOption = {
  id: string;
  title: string;
  isRecorded: boolean;
  schedule: unknown;
  capacity: number | null;
  instructorName: string | null;
  enrolledCount: number;
  seatsLeft: number | null; // null = unlimited
  isDefault: boolean;
};

export type PendingSelection = {
  orderId: string;
  productId: string;
  productName: string;
  clientId: string;
  clientName: string;
  paidAt: string | null;
  batches: BatchOption[];
};

type ClassRow = {
  id: string;
  title: string;
  is_recorded: boolean;
  schedule: unknown;
  capacity: number | null;
  product_id: string | null;
  instructor_id: string | null;
  enrollments: { count: number }[] | null;
};

function toOption(
  c: ClassRow,
  defaultClassId: string | null,
  names: Map<string, string>,
): BatchOption {
  const enrolledCount = c.enrollments?.[0]?.count ?? 0;
  return {
    id: c.id,
    title: c.title,
    isRecorded: c.is_recorded,
    schedule: c.schedule,
    capacity: c.capacity,
    instructorName: c.instructor_id ? (names.get(c.instructor_id) ?? null) : null,
    enrolledCount,
    seatsLeft: c.capacity == null ? null : Math.max(0, c.capacity - enrolledCount),
    isDefault: c.id === defaultClassId,
  };
}

/**
 * Orders a client has paid for whose product has 2+ batches and where the
 * client is not yet enrolled in any of them — i.e. awaiting a batch choice.
 * Pass `clientId` to scope to one client (PWA); omit for the cron sweep.
 */
export async function pendingSelections(
  admin: AdminSupabase,
  tenantId: string,
  clientId?: string,
): Promise<PendingSelection[]> {
  let orderQuery = admin
    .from('orders')
    .select('id, client_id, product_id, paid_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'paid');
  if (clientId) orderQuery = orderQuery.eq('client_id', clientId);
  const { data: orders } = await orderQuery;
  if (!orders || orders.length === 0) return [];

  const productIds = [...new Set(orders.map((o) => o.product_id))];
  const { data: products } = await admin
    .from('products_services')
    .select(
      'id, name, default_class_id, batches:classes!classes_product_id_fkey(id, title, is_recorded, schedule, capacity, product_id, instructor_id, enrollments(count))',
    )
    .eq('tenant_id', tenantId)
    .in('id', productIds);
  const byProduct = new Map((products ?? []).map((p) => [p.id, p]));

  const clientIds = [...new Set(orders.map((o) => o.client_id))];
  const { data: enrollments } = await admin
    .from('enrollments')
    .select('class_id, client_id')
    .eq('tenant_id', tenantId)
    .in('client_id', clientIds);
  const enrolled = new Set((enrollments ?? []).map((e) => `${e.client_id}:${e.class_id}`));

  const { data: clients } = await admin
    .from('clients')
    .select('id, full_name')
    .eq('tenant_id', tenantId)
    .in('id', clientIds);
  const clientName = new Map((clients ?? []).map((c) => [c.id, c.full_name]));

  // `team_members` has no name column — names live in auth metadata.
  const names = await resolveInstructorNames(
    tenantId,
    (products ?? [])
      .flatMap((p) => (p.batches as ClassRow[]).map((b) => b.instructor_id))
      .filter((v): v is string => Boolean(v)),
  );

  const result: PendingSelection[] = [];
  for (const order of orders) {
    const product = byProduct.get(order.product_id);
    const batches = (product?.batches ?? []) as ClassRow[];
    if (batches.length < 2) continue; // 0/1 batch → no choice to make
    const alreadyIn = batches.some((b) => enrolled.has(`${order.client_id}:${b.id}`));
    if (alreadyIn) continue;
    result.push({
      orderId: order.id,
      productId: order.product_id,
      productName: product?.name ?? 'Offering',
      clientId: order.client_id,
      clientName: clientName.get(order.client_id) ?? 'Client',
      paidAt: order.paid_at,
      batches: batches.map((b) => toOption(b, product?.default_class_id ?? null, names)),
    });
  }
  return result;
}

/** Enroll a client into a batch (service role — RLS blocks client inserts). */
export async function enrollInBatch(
  admin: AdminSupabase,
  args: { tenantId: string; clientId: string; classId: string },
): Promise<void> {
  const { error } = await admin
    .from('enrollments')
    .insert({
      tenant_id: args.tenantId,
      class_id: args.classId,
      client_id: args.clientId,
      status: 'active',
    })
    .select('id')
    .single();
  // Ignore unique-violation (already enrolled); surface anything else.
  if (error && error.code !== '23505') throw new Error(error.message);
}

/**
 * Pick the batch to auto-assign: the default if it has room, else the next
 * batch with open seats (most seats first). Returns null if all are full.
 */
export function chooseAutoBatch(batches: BatchOption[]): BatchOption | null {
  const def = batches.find((b) => b.isDefault);
  if (def && (def.seatsLeft === null || def.seatsLeft > 0)) return def;
  const open = batches
    .filter((b) => b.seatsLeft === null || b.seatsLeft > 0)
    .sort((a, b) => (b.seatsLeft ?? Infinity) - (a.seatsLeft ?? Infinity));
  return open[0] ?? null;
}

/**
 * Cron sweep: for every buyer who hasn't picked a batch within the 24h window,
 * auto-assign the default batch (or the next one with open seats). Idempotent —
 * once enrolled, the order is no longer pending. Returns how many were assigned
 * and how many stayed pending (e.g. all batches full).
 */
export async function autoAssignDueSelections(
  admin: AdminSupabase,
  now: number = Date.now(),
): Promise<{ assigned: number; stillPending: number }> {
  const cutoff = new Date(now - BATCH_SELECTION_WINDOW_MS).toISOString();
  const { data: dueOrders } = await admin
    .from('orders')
    .select('tenant_id')
    .eq('status', 'paid')
    .lte('paid_at', cutoff);
  const tenantIds = [...new Set((dueOrders ?? []).map((o) => o.tenant_id))];

  let assigned = 0;
  let stillPending = 0;
  for (const tenantId of tenantIds) {
    const pending = await pendingSelections(admin, tenantId);
    for (const sel of pending) {
      // Only auto-assign once the window has elapsed for this order.
      if (sel.paidAt && new Date(sel.paidAt).getTime() > now - BATCH_SELECTION_WINDOW_MS) {
        continue;
      }
      const batch = chooseAutoBatch(sel.batches);
      if (!batch) {
        stillPending += 1;
        continue;
      }
      // Look up the client for this order to enroll them.
      const { data: order } = await admin
        .from('orders')
        .select('client_id')
        .eq('id', sel.orderId)
        .maybeSingle();
      if (!order) continue;
      await enrollInBatch(admin, {
        tenantId,
        clientId: order.client_id,
        classId: batch.id,
      });
      assigned += 1;
    }
  }
  return { assigned, stillPending };
}
