import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Runs before rendered routes (Next 16 renamed `middleware` → `proxy`). It does
 * two things:
 *  1. Refreshes the Supabase auth session cookie so SSR always sees a valid user.
 *  2. Guards the authenticated app shells — an unauthenticated request to
 *     `/admin/*` or `/app/*` is redirected to the matching login page.
 *
 * Role-level authorization (team vs client, owner vs manager) stays in the
 * server routes/pages and Postgres RLS; the proxy only checks auth presence.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const isClientApp = pathname === '/app' || pathname.startsWith('/app/');

  if (!user && (isAdmin || isClientApp)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = isAdmin ? '/login' : '/client-login';
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  // Run on everything except API routes, Next internals, and static assets.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)'],
};
