import { requireTeamMember } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { automationRuleUpsertSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** List the tenant's automation rules (owner/manager). */
export const GET = handleRoute(async (request) => {
  const { supabase, tenantId } = await requireTeamMember(request, ['owner', 'manager']);

  const { data, error } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('trigger_type', { ascending: true });
  if (error) throw ApiError.unprocessable(error.message);

  return jsonOk({ rules: data ?? [] });
});

/**
 * Create or update a rule (owner/manager). Rules are unique per
 * (tenant, trigger, channel), so this upserts on that key — toggling `enabled`
 * or editing the template for an existing trigger/channel updates in place.
 */
export const PUT = handleRoute(async (request) => {
  const { supabase, tenantId } = await requireTeamMember(request, ['owner', 'manager']);
  const input = await parseJson(request, automationRuleUpsertSchema);

  const { data, error } = await supabase
    .from('automation_rules')
    .upsert(
      {
        tenant_id: tenantId,
        trigger_type: input.triggerType,
        channel: input.channel,
        enabled: input.enabled,
        template: input.template,
      },
      { onConflict: 'tenant_id,trigger_type,channel' },
    )
    .select()
    .single();
  if (error) throw ApiError.unprocessable(error.message);

  return jsonOk({ rule: data });
});
