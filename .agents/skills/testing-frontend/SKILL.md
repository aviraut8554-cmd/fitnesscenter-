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

## Gotchas / tips
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

## Devin Secrets Needed
None for local testing. (Hosted-project keys are only for deploy-time testing and
must not override the local `SUPABASE_SERVICE_ROLE_KEY` when testing locally.)
