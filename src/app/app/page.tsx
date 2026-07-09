import { redirect } from 'next/navigation';
import { ClientHome, type HomeHero } from '@/components/client/home';
import { getClientMembership } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Read the hero config out of the tenant branding jsonb (all fields optional). */
function toHero(value: unknown): HomeHero {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const b = value as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  return {
    title: str(b.heroTitle),
    subtitle: str(b.heroSubtitle),
    imageUrl: str(b.heroImageUrl),
    ctaLabel: str(b.heroCtaLabel),
    ctaHref: str(b.heroCtaHref),
  };
}

export default async function ClientHomePage() {
  const membership = await getClientMembership();
  if (!membership) redirect('/client-login');

  const supabase = await createServerSupabase();
  const { data: tenant } = await supabase
    .from('tenants')
    .select('branding')
    .eq('id', membership.tenantId)
    .maybeSingle();

  return <ClientHome fullName={membership.fullName} hero={toHero(tenant?.branding)} />;
}
