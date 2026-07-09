import type { Json } from '@/lib/database.types';
import type { Branding, SettingsResponse } from '@/lib/admin-types';
import { requireTeamMember } from '@/lib/auth';
import { ApiError, handleRoute, jsonOk, parseJson } from '@/lib/http';
import { settingsUpdateSchema } from '@/lib/validation';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { razorpayStatusForTenant } from '@/lib/razorpay-status';

export const dynamic = 'force-dynamic';

/** Normalize the stored branding jsonb into the typed subset we expose. */
function toBranding(value: Json | null): Branding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const b = value as Record<string, unknown>;
  const out: Branding = {};
  if (typeof b.logoUrl === 'string') out.logoUrl = b.logoUrl;
  if (typeof b.primaryColor === 'string') out.primaryColor = b.primaryColor;
  if (typeof b.tagline === 'string') out.tagline = b.tagline;
  if (typeof b.heroImageUrl === 'string') out.heroImageUrl = b.heroImageUrl;
  if (typeof b.heroTitle === 'string') out.heroTitle = b.heroTitle;
  if (typeof b.heroSubtitle === 'string') out.heroSubtitle = b.heroSubtitle;
  if (typeof b.heroCtaLabel === 'string') out.heroCtaLabel = b.heroCtaLabel;
  if (typeof b.heroCtaHref === 'string') out.heroCtaHref = b.heroCtaHref;
  return out;
}

/**
 * Read the tenant's business profile, plan, usage and connection status.
 * Any team member may read Settings; only the owner may change it (see PUT).
 */
export const GET = handleRoute(async (request) => {
  const { supabase, tenantId } = await requireTeamMember(request);

  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id, name, subdomain, branding, plan_id')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) throw ApiError.unprocessable(error.message);
  if (!tenant) throw ApiError.notFound('Tenant not found');

  const { data: plan } = tenant.plan_id
    ? await supabase.from('plans').select('*').eq('id', tenant.plan_id).maybeSingle()
    : { data: null };

  const [{ count: clientCount }, { count: teamCount }] = await Promise.all([
    supabase.from('clients').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase
      .from('team_members')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
  ]);

  const razorpay = await razorpayStatusForTenant(createAdminSupabase(), tenantId);

  const response: SettingsResponse = {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      subdomain: tenant.subdomain,
      branding: toBranding(tenant.branding),
    },
    plan: plan ?? null,
    usage: { clientCount: clientCount ?? 0, teamCount: teamCount ?? 0 },
    razorpay,
  };
  return jsonOk(response);
});

/**
 * Update business name, subdomain and/or branding. Owner only — enforced here
 * for a clear error and again by the `tenants_update` RLS policy. A duplicate
 * subdomain surfaces as 409.
 */
export const PUT = handleRoute(async (request) => {
  const { supabase, tenantId } = await requireTeamMember(request, ['owner']);
  const input = await parseJson(request, settingsUpdateSchema);

  const patch: { name?: string; subdomain?: string; branding?: Json } = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.subdomain !== undefined) patch.subdomain = input.subdomain;
  if (input.branding !== undefined) {
    // Drop empty-string logoUrl so clearing the field removes it.
    const b: Branding = {};
    if (input.branding.logoUrl) b.logoUrl = input.branding.logoUrl;
    if (input.branding.primaryColor) b.primaryColor = input.branding.primaryColor;
    if (input.branding.tagline) b.tagline = input.branding.tagline;
    if (input.branding.heroImageUrl) b.heroImageUrl = input.branding.heroImageUrl;
    if (input.branding.heroTitle) b.heroTitle = input.branding.heroTitle;
    if (input.branding.heroSubtitle) b.heroSubtitle = input.branding.heroSubtitle;
    if (input.branding.heroCtaLabel) b.heroCtaLabel = input.branding.heroCtaLabel;
    if (input.branding.heroCtaHref) b.heroCtaHref = input.branding.heroCtaHref;
    patch.branding = b as Json;
  }

  const { data, error } = await supabase
    .from('tenants')
    .update(patch)
    .eq('id', tenantId)
    .select('id, name, subdomain, branding')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') throw ApiError.conflict('That subdomain is already taken');
    throw ApiError.unprocessable(error.message);
  }
  if (!data) throw ApiError.notFound('Tenant not found');

  return jsonOk({
    tenant: {
      id: data.id,
      name: data.name,
      subdomain: data.subdomain,
      branding: toBranding(data.branding),
    },
  });
});
