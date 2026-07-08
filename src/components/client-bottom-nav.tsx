'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS: { label: string; href: string }[] = [
  { label: 'Home', href: '/app' },
  { label: 'Shop', href: '/app/shop' },
  { label: 'Book', href: '/app/book' },
  { label: 'Orders', href: '/app/orders' },
  { label: 'Health', href: '/app/health' },
  { label: 'Profile', href: '/app/profile' },
];

export function ClientBottomNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky bottom-0 z-10 grid grid-cols-6 border-t border-ink-100 bg-white">
      {TABS.map((tab) => {
        const active = pathname === tab.href || (tab.href !== '/app' && pathname.startsWith(tab.href));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
              active ? 'text-brand-600' : 'text-ink-400 hover:text-ink-700'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
