import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Card, PageHeading } from '@/components/ui';
import { getTeamMembership } from '@/lib/session';
import type { TeamRole } from '@/lib/admin-types';

/** `roles` mirrors the sidebar access matrix (omitted = visible to every role). */
const SHORTCUTS: { label: string; href: string; desc: string; roles?: TeamRole[] }[] = [
  { label: 'Clients', href: '/admin/clients', desc: 'Manage your roster and health forms' },
  {
    label: 'Products',
    href: '/admin/products',
    desc: 'Courses, plans and services',
    roles: ['owner', 'manager'],
  },
  {
    label: 'Payments',
    href: '/admin/payments',
    desc: 'Orders, invoices and revenue',
    roles: ['owner'],
  },
  { label: 'Team', href: '/admin/team', desc: 'Invite and manage staff', roles: ['owner'] },
];

export default async function AdminDashboardPage() {
  const membership = await getTeamMembership();
  if (!membership) redirect('/login');

  const shortcuts = SHORTCUTS.filter((s) => !s.roles || s.roles.includes(membership.role));

  return (
    <div>
      <PageHeading title="Dashboard" subtitle="Your business at a glance" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {shortcuts.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <h3 className="text-base font-bold text-ink-900">{s.label}</h3>
              <p className="mt-1 text-sm text-ink-500">{s.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
