import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AdminSidebar } from '@/components/admin-sidebar';
import { SignOutButton } from '@/components/sign-out-button';
import { getTeamMembership } from '@/lib/session';
import { createServerSupabase } from '@/lib/supabase/server';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const membership = await getTeamMembership();
  if (!membership) redirect('/login');

  const supabase = await createServerSupabase();
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', membership.tenantId)
    .maybeSingle();

  return (
    <div className="flex min-h-screen bg-ink-50">
      <aside className="hidden w-64 flex-col bg-ink-900 py-6 md:flex">
        <Link href="/admin" className="mb-6 px-6 text-lg font-bold tracking-tight text-white">
          Fitness<span className="text-brand-500">OS</span>
        </Link>
        <AdminSidebar role={membership.role} />
        <div className="mt-4 px-6 text-xs text-ink-500">Signed in as {membership.role}</div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-ink-100 bg-white px-6 py-4">
          <span className="font-semibold text-ink-900">{tenant?.name ?? 'Your business'}</span>
          <SignOutButton redirectTo="/login" />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
