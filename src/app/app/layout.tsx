import { redirect } from 'next/navigation';
import { ClientBottomNav } from '@/components/client-bottom-nav';
import { SignOutButton } from '@/components/sign-out-button';
import { getClientMembership } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase/server';

export default async function ClientAppLayout({ children }: { children: React.ReactNode }) {
  const membership = await getClientMembership();
  if (!membership) redirect('/client-login');

  const supabase = await createServerSupabase();
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', membership.tenantId)
    .maybeSingle();

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-ink-50">
      <header className="flex items-center justify-between border-b border-ink-100 bg-white px-4 py-3">
        <div>
          <p className="text-xs text-ink-400">{tenant?.name ?? 'Your coach'}</p>
          <p className="text-sm font-semibold text-ink-900">Hi, {membership.fullName}</p>
        </div>
        <SignOutButton redirectTo="/client-login" />
      </header>
      <main className="flex-1 p-4">{children}</main>
      <ClientBottomNav />
    </div>
  );
}
