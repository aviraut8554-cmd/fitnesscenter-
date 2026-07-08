---
name: testing-frontend
description: End-to-end test the Fitness Creator OS frontend (admin dashboard + client PWA) through the browser. Use when verifying auth flows, dashboard/PWA shells, navigation, or any UI wired to the Phase 1/2 APIs.
---

# Testing the frontend

Unlike the backend, this IS a UI — test through the browser and **record** it.

## Setup (once per session)
1. Local Supabase running: `supabase status` (start with `supabase start`).
2. Start the app against the **local** stack. The host may inject a hosted-project
   `SUPABASE_SERVICE_ROLE_KEY` that overrides `.env.local` and breaks signup —
   always export the local service-role key first:
   ```bash
   export SUPABASE_SERVICE_ROLE_KEY="<local service_role from `supabase status`>"
   npm run build && npm run start   # prod server; rebuild after any source edit
   ```
   Verify: `curl -s -o /dev/null -w "%{http_code}" localhost:3000/` → `200`.
3. Maximize the browser window before recording (`wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz`).

## Key routes & flows
- Landing `/`; auth pages `/login`, `/signup`, `/client-login`, `/client-signup`.
- Admin shell `/admin/*` — server layout guards **team** membership (redirect `/login`).
- Client PWA shell `/app/*` — server layout guards **client** membership (redirect `/client-login`).
- Route protection is in `src/proxy.ts` (Next 16 renamed `middleware` → `proxy`);
  unauth `/admin`→`/login?next=…`, `/app`→`/client-login?next=…`.

## Golden-path test
1. **Creator**: `/signup` (name, business, subdomain e.g. `devgym`, email, password ≥8)
   → lands `/admin`. Assert full sidebar (Dashboard, Clients, Products, Payments,
   Bookings, Classes, Chat, Team, Settings) with "Soon" on Bookings/Classes/Chat.
2. **Client**: `/client-signup` using the **same subdomain** (`devgym`) + fullName/email/password
   → lands `/app` greeting the client under the coach's business name; bottom nav
   Home/Shop/Orders/Health/Profile.
3. **Auth gating**: sign out, visit `/admin` and `/app` while logged out → redirected to login.

## Automations (Phase 4) test
Admin **Automations** page (`/admin/automations`, owner/manager) lists per-trigger cards,
each with Email/WhatsApp rows: "Turn on/off" + "Edit message" (subject/body with `{{tokens}}`).
Daily cron `GET|POST /api/cron/reminders` (open unless `CRON_SECRET` set) queues into the
`notifications` outbox and dispatches (dry-run/log mode → `status: sent` when no provider creds).
1. UI: toggle a rule on (badge Off→On green), edit + save template, reopen to confirm persistence.
2. Scoping: seed a class session inside the 24h window with exactly one enrolled client; run cron;
   query `notifications` (columns: `trigger_type`, `channel`, `recipient`, `subject`, `body`,
   `status`, `dedup_key`) — expect **exactly one** row for the enrolled client, none for others.
   `dedup_key` = `class_session:<sessionId>:<clientId>:<channel>`; start time renders in tenant TZ.
3. Idempotency: run cron again → summary counts 0, row count unchanged (unique dedup constraint).
- Seed with `seed-automation-test.mjs`. Query DB with a `@supabase/supabase-js` service-role
  script run **from the repo dir** (so `node_modules` resolves); `psql` isn't installed.

## Gotchas / tips
- **Client bundle must not import server-only code:** a `'use client'` component importing
  shared metadata from a module that also exports server logic (e.g. importing from
  `@/lib/automation`, which transitively pulls `notifier` → `env` validation) crashes the page
  at load with `Invalid environment configuration: … SUPABASE_SERVICE_ROLE_KEY: Required`.
  Keep pure/client-safe metadata in its own module (e.g. `@/lib/automation-templates.ts`) and
  import that from client components. If a page errors only with an env message, suspect this.
- **Stale-server vs stale-cache:** if a page still shows the pre-fix error after a browser
  restart, the running `next-server` may be serving an **older** `.next` than what's on disk.
  Verify: `curl -s -o /dev/null -w "%{http_code}" localhost:3000/_next/static/$(cat .next/BUILD_ID)/_buildManifest.js`
  should be `200`; a served client chunk with the error text 404/500ing means the process is
  stale. Fix: kill the listener on :3000, `rm -rf .next && npm run build`, start ONE server,
  re-confirm the BUILD_ID is served, then restart the browser to bust cache.
- Signup auto-signs-in via `signInWithPassword` (Supabase creates the user with
  `email_confirm: true`, so no email step). If auto sign-in ever breaks, check that.
- Use a fresh timestamped email each run (`creator+$(date +%s)@example.com`) — the
  same email can't sign up twice.
- Client signup needs an existing **active** tenant with that subdomain, else
  "No active fitness business found" — create the creator/tenant first.
- Distinguish `ComingSoon` (no backend: Bookings/Classes/Chat) from `SectionPlaceholder`
  (backend exists, UI wired later: Clients/Products/Payments/Team) — they render
  different copy.
- Test data lives in **local** Supabase only.
- **Stale build gotcha:** if a page still shows an old placeholder after your changes,
  a previous `next-server` may still hold port 3000 (so your new `npm run start` never
  bound). Kill any listener first and clear the cache: `ss -ltnp | grep :3000` →
  `kill <pid>`, then `rm -rf .next && npm run build && npm run start`. Rebuild after
  every source edit — `next start` serves the prebuilt `.next`, not live source.
- **Commerce seeding:** `seed-admin-test.mjs` seeds tenant/owner/support/clients but NOT
  products/orders. To test Products/Payments/PWA-store, also seed via the service_role
  admin client: 2 active + 1 inactive `products_services`, plus a paid `orders` row with a
  `captured` `payments` row and an `issued` `invoices` row. Create a client `auth` user and
  set `clients.user_id` so you can log into the PWA and see the order under RLS.
- **Razorpay boundary:** with a `dummy_…` `RAZORPAY_KEY_SECRET`, `POST /api/orders`
  (Buy now) and `POST /api/orders/[id]/refund` (Refund) call the real Razorpay API and
  fail — surfacing a clean red banner ("Authentication failed" / "Razorpay request failed").
  Order creation calls Razorpay *before* the DB insert (`orders/route.ts`), so a failed
  Buy now leaves **no** order row. This is the expected boundary without real test keys.
- Money: prices entered in **major units** (e.g. 1500) → stored as minor (150000) →
  displayed `₹1,500.00`. A card showing `₹15.00` or `₹150000.00` means the conversion broke.
- Browser `type` into `<input type=number>` **appends** rather than replacing — clear first
  with click → `Control+a` → `Backspace`, then type the new value.
- Dashboard **body** cards were role-gated in a separate PR from the sidebar; if support
  still sees Products/Payments/Team cards, check which branch you're on before flagging.

## Devin Secrets Needed
None for local testing. (Hosted-project keys are only for deploy-time testing and
must not override the local `SUPABASE_SERVICE_ROLE_KEY` when testing locally.)
