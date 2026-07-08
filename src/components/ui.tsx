import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

/** Shared, presentational UI primitives. Bold/energetic direction (brand orange). */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
};

const buttonVariants: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 focus-visible:outline-brand-500',
  secondary: 'bg-ink-100 text-ink-900 hover:bg-ink-200 focus-visible:outline-ink-400',
  ghost: 'bg-transparent text-ink-700 hover:bg-ink-100 focus-visible:outline-ink-300',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600',
};

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${buttonVariants[variant]} ${className}`}
    >
      {loading ? 'Please wait…' : children}
    </button>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string };

export function Field({ label, id, className = '', ...props }: FieldProps) {
  const inputId = id ?? props.name;
  return (
    <label htmlFor={inputId} className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-700">{label}</span>
      <input
        id={inputId}
        {...props}
        className={`w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${className}`}
      />
    </label>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-ink-100 bg-white p-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Alert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'info' }) {
  const tones = {
    error: 'border-red-200 bg-red-50 text-red-700',
    info: 'border-brand-200 bg-brand-50 text-brand-700',
  } as const;
  return (
    <div role="alert" className={`rounded-lg border px-3.5 py-2.5 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function PageHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-ink-500">{subtitle}</p> : null}
    </div>
  );
}

type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-ink-100 text-ink-600',
  brand: 'bg-brand-100 text-brand-700',
  success: 'bg-success-100 text-success-700',
  warning: 'bg-warning-100 text-warning-700',
  danger: 'bg-red-100 text-red-700',
};

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: BadgeTone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Map a client status enum to a coloured pill (spec: status is never plain text). */
export function ClientStatusBadge({ status }: { status: string }) {
  const tone: BadgeTone =
    status === 'active'
      ? 'success'
      : status === 'renewal_due'
        ? 'warning'
        : status === 'trial'
          ? 'brand'
          : status === 'expired' || status === 'churned'
            ? 'danger'
            : 'neutral';
  return <Badge tone={tone}>{status.replace('_', ' ')}</Badge>;
}

/** Map an order status enum to a coloured pill. */
export function OrderStatusBadge({ status }: { status: string }) {
  const tone: BadgeTone =
    status === 'paid'
      ? 'success'
      : status === 'created' || status === 'pending'
        ? 'warning'
        : status === 'refunded' || status === 'partially_refunded'
          ? 'brand'
          : status === 'failed' || status === 'cancelled'
            ? 'danger'
            : 'neutral';
  return <Badge tone={tone}>{status.replace(/_/g, ' ')}</Badge>;
}

/** Map an invoice status enum to a coloured pill. */
export function InvoiceStatusBadge({ status }: { status: string }) {
  const tone: BadgeTone =
    status === 'paid'
      ? 'success'
      : status === 'issued'
        ? 'brand'
        : status === 'refunded'
          ? 'warning'
          : status === 'void'
            ? 'danger'
            : 'neutral';
  return <Badge tone={tone}>{status}</Badge>;
}

/** Active/inactive pill for products/services. */
export function ActiveBadge({ active }: { active: boolean }) {
  return <Badge tone={active ? 'success' : 'neutral'}>{active ? 'Active' : 'Inactive'}</Badge>;
}

export function RoleBadge({ role }: { role: string }) {
  const tone: BadgeTone = role === 'owner' ? 'brand' : role === 'manager' ? 'success' : 'neutral';
  return <Badge tone={tone}>{role}</Badge>;
}

export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-ink-100 bg-ink-50 text-xs font-semibold uppercase tracking-wide text-ink-500">
          {head}
        </thead>
        <tbody className="divide-y divide-ink-100">{children}</tbody>
      </table>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-white/60 p-10 text-center">
      <h2 className="text-lg font-bold text-ink-900">{title}</h2>
      {hint ? <p className="mt-1 max-w-sm text-sm text-ink-500">{hint}</p> : null}
    </div>
  );
}

export function ComingSoon({ feature }: { feature: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-white/60 p-10 text-center">
      <span className="mb-3 inline-flex rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
        Coming soon
      </span>
      <h2 className="text-xl font-bold text-ink-900">{feature}</h2>
      <p className="mt-2 max-w-sm text-sm text-ink-500">
        This module is on the roadmap. The layout is in place; functionality ships in a later phase.
      </p>
    </div>
  );
}
