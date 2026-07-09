import { requireTenantActor } from '@/lib/auth';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { batchSelectionSchema } from '@/lib/validation';
import { enrollInBatch, pendingSelections } from '@/lib/batch-selection';

export const dynamic = 'force-dynamic';

/** Offerings the signed-in client has paid for and still needs to pick a batch. */
export const GET = handleRoute(async (request) => {
  const actor = await requireTenantActor(request);
  if (actor.kind !== 'client') {
    throw ApiError.forbidden('Only clients select batches');
  }
  const admin = createAdminSupabase();
  const pending = await pendingSelections(admin, actor.tenantId, actor.clientId);
  return jsonOk({ pending });
});

/** The client picks one batch for a product they've paid for. */
export const POST = handleRoute(async (request) => {
  const actor = await requireTenantActor(request);
  if (actor.kind !== 'client') {
    throw ApiError.forbidden('Only clients select batches');
  }
  const { tenantId, clientId } = actor;
  const input = await parseJson(request, batchSelectionSchema);
  const admin = createAdminSupabase();

  const pending = await pendingSelections(admin, tenantId, clientId);
  const selection = pending.find((p) => p.productId === input.productId);
  if (!selection) {
    throw ApiError.badRequest('No batch selection is pending for this offering.');
  }
  const batch = selection.batches.find((b) => b.id === input.classId);
  if (!batch) throw ApiError.badRequest('That batch is not part of this offering.');
  if (batch.seatsLeft !== null && batch.seatsLeft <= 0) {
    throw ApiError.conflict('That batch is full. Please pick another.');
  }

  await enrollInBatch(admin, { tenantId, clientId, classId: input.classId });
  return jsonOk({ enrolled: { classId: input.classId } }, 201);
});
