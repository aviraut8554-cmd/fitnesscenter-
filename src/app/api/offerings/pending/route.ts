import { requireTeamMember } from '@/lib/auth';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { handleRoute, jsonOk } from '@/lib/http';
import { pendingSelections } from '@/lib/batch-selection';

export const dynamic = 'force-dynamic';

/**
 * Buyers in this tenant who have paid but not yet been placed in a batch
 * (their product has 2+ batches). Owner/manager use this to assign manually.
 */
export const GET = handleRoute(async (request) => {
  const { tenantId } = await requireTeamMember(request, ['owner', 'manager']);
  const admin = createAdminSupabase();
  const pending = await pendingSelections(admin, tenantId);
  return jsonOk({ pending });
});
