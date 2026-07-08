import Link from 'next/link';
import { Card } from '@/components/ui';

const TILES = [
  { label: 'Shop plans', href: '/app/shop', desc: 'Browse and buy programs' },
  { label: 'My orders', href: '/app/orders', desc: 'Payments and invoices' },
  { label: 'Health form', href: '/app/health', desc: 'Keep your profile updated' },
];

export default function ClientHomePage() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-ink-900 p-5 text-white">
        <h1 className="text-xl font-bold">Let&apos;s get to work.</h1>
        <p className="mt-1 text-sm text-ink-300">Your coaching hub — programs, payments and progress.</p>
      </div>
      <div className="grid gap-3">
        {TILES.map((t) => (
          <Link key={t.href} href={t.href}>
            <Card className="transition-shadow hover:shadow-md">
              <h3 className="text-base font-bold text-ink-900">{t.label}</h3>
              <p className="mt-1 text-sm text-ink-500">{t.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
