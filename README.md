# Fitness Creator OS — Backend

Multi-tenant business-management platform for fitness influencers. This
repository is the **backend source of truth**: relational schema, Row-Level
Security, auth, and API route handlers. Admin and client UIs are built
separately on top of these APIs and database — they must not invent their own
backend or bypass RLS.

## Stack

- **Next.js (App Router)** route handlers — TypeScript, strict mode
- **Supabase** — Postgres + Auth + Storage, with RLS enforced at the DB level
- **Zod** — request validation
- **Vitest** — unit + integration tests (RLS isolation, DB constraints)

## Architecture

- Every tenant-scoped table has RLS enabled. Isolation is enforced in the
  database via SECURITY DEFINER helpers (`app.is_team_member`, `app.has_role`,
  `app.is_client_of`, `app.owns_client`) — not just in application code.
- Two Supabase clients:
  - **User client** (`src/lib/supabase/server.ts`) — runs as the signed-in user
    (bearer token or cookie); all normal reads/writes go through it so RLS
    applies.
  - **Admin client** (`src/lib/supabase/admin.ts`) — service role, bypasses RLS.
    Used only for trusted server-verified operations (signup provisioning, and
    later: order creation and webhook processing).
- Money is stored as integer minor units (paise) with an ISO currency code.
- Monetary/state changes that must be trustworthy (payments) will be
  webhook-driven only (Phase 2).

## Local development

Requires Docker (for the Supabase local stack) and Node 22.

```bash
npm install
supabase start          # boots local Postgres/Auth/Storage, applies migrations
cp .env.example .env.local
# fill .env.local with the URL + keys printed by `supabase status`
npm run dev
```

Useful scripts:

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev / build / prod |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm test` | Vitest (integration suites auto-skip if no local Supabase) |
| `npm run db:reset` | Recreate local DB and re-apply all migrations |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` from the schema |

## Database

Migrations live in `supabase/migrations/` and are applied in order:

1. `0001_extensions_and_enums.sql` — extensions, `app` schema, enum types
2. `0002_tables.sql` — normalized tables, FKs, indexes, constraints
3. `0003_functions_triggers.sql` — `updated_at`, health-form versioning, RLS
   helpers, `provision_tenant` RPC
4. `0004_rls.sql` — RLS enablement and policies
5. `0005_seed_plans.sql` — default pricing tiers

After changing a migration, run `npm run db:reset && npm run db:types`.

## API (Phase 1)

All `/api/*` routes accept `Authorization: Bearer <supabase_jwt>` (or session
cookie). When a user belongs to multiple tenants, pass `x-tenant-id`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Liveness check |
| POST | `/api/auth/signup/influencer` | Create tenant owner + tenant (atomic) |
| POST | `/api/auth/signup/client` | Onboard a client into a tenant by subdomain |
| GET/POST | `/api/team` | List / add team members (owner only for add) |
| GET/POST | `/api/clients` | List / create clients |
| GET/PATCH/DELETE | `/api/clients/{id}` | Read / update / delete a client |
| GET/POST | `/api/clients/{id}/health-forms` | List / submit versioned health forms |

## Roadmap (per PRD)

- **Phase 1 (this)** — schema, RLS, auth, client management, health forms ✅
- **Phase 2** — products/services, Razorpay orders + webhooks + subscriptions,
  invoices, refunds, seat/plan gating
- **Phase 3** — Google Calendar sync, booking conflict logic, classes,
  attendance
- **Phase 4** — WhatsApp/email automation, chat
- **Phase 5** — hardening, monitoring, E2E tests
