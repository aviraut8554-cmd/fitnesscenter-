import { redirect } from 'next/navigation';
import { ClientBottomNav } from '@/components/client-bottom-nav';
import { InstallPrompt } from '@/components/install-prompt';
import { SignOutButton } from '@/components/sign-out-button';
import { ToastProvider } from '@/components/toast';
import { getClientMembership } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase/server';

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || '·'
  );
}

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
    <div className="min-h-screen bg-ink-100 sm:py-6">
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col overflow-hidden bg-ink-50 sm:min-h-[calc(100vh-3rem)] sm:rounded-3xl sm:shadow-xl sm:ring-1 sm:ring-ink-200">
        <header
          className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-100 bg-white/95 px-4 py-3 backdrop-blur"
          style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-sm font-bold text-white">
              {initials(tenant?.name ?? 'FC')}
            </div>
            <div>
              <p className="text-[11px] font-medium text-ink-400">{tenant?.name ?? 'Your coach'}</p>
              <p className="text-sm font-semibold text-ink-900">Hi, {membership.fullName}</p>
            </div>
          </div>
          <SignOutButton redirectTo="/client-login" />
        </header>
        <ToastProvider>
          <main className="flex-1 p-4">{children}</main>
        </ToastProvider>
        <InstallPrompt />
        <ClientBottomNav />
      </div>
    </div>
  );
}
