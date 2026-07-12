import { redirect } from 'next/navigation';
import { ClientHome } from '@/components/client/home';
import type { HeroCard } from '@/lib/admin-types';
import { getClientMembership } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Read one hero card out of an unknown jsonb object; blank strings dropped. */
function toCard(value: unknown): HeroCard {
  const b = value as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  return {
    title: str(b.title),
    subtitle: str(b.subtitle),
    imageUrl: str(b.imageUrl),
    ctaLabel: str(b.ctaLabel),
    ctaHref: str(b.ctaHref),
  };
}

/**
 * Read the hero cards out of the tenant branding jsonb. Prefers the new
 * `heroCards` array; falls back to the legacy single-hero fields so tenants
 * configured before the carousel still show their banner.
 */
function toHeroCards(value: unknown): HeroCard[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const b = value as Record<string, unknown>;
  if (Array.isArray(b.heroCards) && b.heroCards.length > 0) {
    return b.heroCards.filter((c) => c && typeof c === 'object').map(toCard);
  }
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  const legacy: HeroCard = {
    title: str(b.heroTitle),
    subtitle: str(b.heroSubtitle),
    imageUrl: str(b.heroImageUrl),
    ctaLabel: str(b.heroCtaLabel),
    ctaHref: str(b.heroCtaHref),
  };
  return Object.values(legacy).some((v) => v) ? [legacy] : [];
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

  return <ClientHome fullName={membership.fullName} heroCards={toHeroCards(tenant?.branding)} />;
}
