'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

type Tab = { label: string; href: string; icon: (active: boolean) => React.ReactNode };

const iconProps = (active: boolean) => ({
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: active ? 2.2 : 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

const HomeIcon = (a: boolean) => (
  <svg {...iconProps(a)}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </svg>
);
const ShopIcon = (a: boolean) => (
  <svg {...iconProps(a)}>
    <path d="M3 9h18l-1 11H4L3 9Z" />
    <path d="M8 9a4 4 0 0 1 8 0" />
  </svg>
);
const BookIcon = (a: boolean) => (
  <svg {...iconProps(a)}>
    <rect x="3" y="4.5" width="18" height="16" rx="2" />
    <path d="M8 3v3M16 3v3M3 9h18" />
  </svg>
);
const ClassIcon = (a: boolean) => (
  <svg {...iconProps(a)}>
    <path d="M6.5 9v6M17.5 9v6M4 10.5v3M20 10.5v3M6.5 12h11" />
  </svg>
);
const MoreIcon = (a: boolean) => (
  <svg {...iconProps(a)}>
    <circle cx="5" cy="12" r="1.4" />
    <circle cx="12" cy="12" r="1.4" />
    <circle cx="19" cy="12" r="1.4" />
  </svg>
);

const PRIMARY: Tab[] = [
  { label: 'Home', href: '/app', icon: HomeIcon },
  { label: 'Shop', href: '/app/shop', icon: ShopIcon },
  { label: 'Book', href: '/app/book', icon: BookIcon },
  { label: 'Classes', href: '/app/classes', icon: ClassIcon },
];

const MORE: { label: string; href: string }[] = [
  { label: 'Orders', href: '/app/orders' },
  { label: 'Health', href: '/app/health' },
  { label: 'Profile', href: '/app/profile' },
];

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== '/app' && pathname.startsWith(href));
}

export function ClientBottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE.some((m) => isActive(pathname, m.href));

  return (
    <>
      {moreOpen ? (
        <div className="fixed inset-0 z-20 mx-auto max-w-md" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-ink-900/30" />
          <div
            className="absolute inset-x-0 bottom-[64px] rounded-t-2xl border-t border-ink-100 bg-white p-2 shadow-lg"
            style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            {MORE.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                onClick={() => setMoreOpen(false)}
                className={`block rounded-xl px-4 py-3 text-sm font-medium ${
                  isActive(pathname, m.href) ? 'bg-brand-50 text-brand-600' : 'text-ink-700'
                }`}
              >
                {m.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <nav
        className="sticky bottom-0 z-30 grid grid-cols-5 border-t border-ink-100 bg-white/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {PRIMARY.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                active ? 'text-brand-600' : 'text-ink-400 hover:text-ink-700'
              }`}
            >
              {tab.icon(active)}
              {tab.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
            moreActive || moreOpen ? 'text-brand-600' : 'text-ink-400 hover:text-ink-700'
          }`}
        >
          {MoreIcon(moreActive || moreOpen)}
          More
        </button>
      </nav>
    </>
  );
}
