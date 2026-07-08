import Link from 'next/link';
import { Card, PageHeading } from '@/components/ui';

const SHORTCUTS = [
  { label: 'Clients', href: '/admin/clients', desc: 'Manage your roster and health forms' },
  { label: 'Products', href: '/admin/products', desc: 'Courses, plans and services' },
  { label: 'Payments', href: '/admin/payments', desc: 'Orders, invoices and revenue' },
  { label: 'Team', href: '/admin/team', desc: 'Invite and manage staff' },
];

export default function AdminDashboardPage() {
  return (
    <div>
      <PageHeading title="Dashboard" subtitle="Your business at a glance" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SHORTCUTS.map((s) => (
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
