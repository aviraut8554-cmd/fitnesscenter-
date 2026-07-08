'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Full admin navigation so the product looks complete. `soon: true` items render
 * a "Soon" badge and lead to a Coming-soon placeholder; the rest are wired to
 * real data (Phase 1/2 backend).
 */
const NAV: { label: string; href: string; soon?: boolean }[] = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Clients', href: '/admin/clients' },
  { label: 'Products', href: '/admin/products' },
  { label: 'Payments', href: '/admin/payments' },
  { label: 'Bookings', href: '/admin/bookings', soon: true },
  { label: 'Classes', href: '/admin/classes', soon: true },
  { label: 'Chat', href: '/admin/chat', soon: true },
  { label: 'Team', href: '/admin/team' },
  { label: 'Settings', href: '/admin/settings' },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV.map((item) => {
        const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active ? 'bg-brand-500 text-white' : 'text-ink-300 hover:bg-ink-800 hover:text-white'
            }`}
          >
            {item.label}
            {item.soon ? (
              <span className="rounded-full bg-ink-700 px-2 py-0.5 text-[10px] font-semibold uppercase text-ink-300">
                Soon
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
