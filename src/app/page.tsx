import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-ink-900 text-white">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6">
        <header className="flex items-center justify-between py-6">
          <span className="text-lg font-bold tracking-tight">
            Fitness<span className="text-brand-500">OS</span>
          </span>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/login" className="rounded-lg px-3 py-2 font-medium text-ink-200 hover:text-white">
              Creator login
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-brand-500 px-4 py-2 font-semibold text-white hover:bg-brand-600"
            >
              Start free
            </Link>
          </nav>
        </header>

        <section className="flex flex-1 flex-col justify-center py-16">
          <p className="mb-4 inline-flex w-fit rounded-full border border-brand-500/40 bg-brand-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-400">
            Built for fitness creators
          </p>
          <h1 className="max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
            Run your entire coaching business in one
            <span className="text-brand-500"> powerful OS</span>.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ink-300">
            Clients, payments, programs, and your own branded client app — everything you need to
            scale, minus the busywork.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/signup"
              className="rounded-xl bg-brand-500 px-6 py-3 text-base font-semibold text-white hover:bg-brand-600"
            >
              Create your account
            </Link>
            <Link
              href="/client-login"
              className="rounded-xl border border-ink-700 px-6 py-3 text-base font-semibold text-ink-100 hover:bg-ink-800"
            >
              I&apos;m a client
            </Link>
          </div>
        </section>

        <footer className="border-t border-ink-800 py-6 text-sm text-ink-500">
          © {new Date().getFullYear()} Fitness Creator OS
        </footer>
      </div>
    </main>
  );
}
