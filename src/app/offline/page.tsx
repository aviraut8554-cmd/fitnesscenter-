export const metadata = { title: 'Offline' };

export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 bg-ink-50 px-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500 text-2xl">
        📶
      </div>
      <h1 className="text-lg font-bold text-ink-900">You’re offline</h1>
      <p className="text-sm text-ink-500">
        We couldn’t reach the network. Check your connection — your app will pick up right where you
        left off once you’re back online.
      </p>
    </div>
  );
}
