---
name: testing-backend-api
description: End-to-end test the Fitness Creator OS backend (Next.js API + Supabase RLS) over HTTP. Use when verifying auth, multi-tenant RLS isolation, client management, team roles, or health-form versioning changes.
---

# Testing the backend API

This is a **headless backend** — no UI. Test over HTTP with `curl`; there is
nothing to record, so collect command output as evidence instead of a video.

## Setup (once per session)
1. Local Supabase must be running: `supabase status` (start with `supabase start`).
   Migrations apply via `npm run db:reset`.
2. Start the app against the **local** stack. The host may inject a
   `SUPABASE_SERVICE_ROLE_KEY` for a *hosted* project that overrides `.env.local`
   and breaks signup — always export the local service-role key when starting:
   ```bash
   export SUPABASE_SERVICE_ROLE_KEY="<local service_role from `supabase status`>"
   npm run build && npm run start   # or `npm run dev`
   ```
   Verify: `curl localhost:3000/api/health` → `{"data":{"status":"ok",...}}`.
3. After any code change, `npm run build` before `npm run start` (prod server
   serves the built output; `next start` won't pick up source edits otherwise).

## Auth flow for requests
API routes accept a Supabase user JWT as `Authorization: Bearer <jwt>`
(`src/lib/auth.ts`). Get a token via the password grant:
```bash
curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: <ANON_KEY>" -H 'content-type: application/json' \
  -d '{"email":"...","password":"password123"}' | jq -r .access_token
```
Note: Supabase lowercases emails — log in with the lowercased form.

## Core assertions worth proving (adversarial)
- **RLS isolation:** owner of tenant A `GET /api/clients/{B_client_id}` must be
  `404` (not `200` with B's data). This is the strongest signal RLS is on.
- **Role gating:** a `client` gets `403` on `/api/team`; a `support` member gets
  `403` on `POST /api/team` (`Requires role: owner`).
- **Health-form versioning:** two `POST /clients/{id}/health-forms` → versions
  `1` then `2`; sending `version` in the body must be ignored (trigger-assigned).
- **Signup guards:** duplicate subdomain → `409`; unknown subdomain → `404`.

## Known pitfalls / things that might break
- **Tenant resolution:** `requireTeamMember` must filter `team_members` by the
  caller's `user_id`. RLS lets a member read the whole roster, so an unfiltered
  query miscounts a multi-member tenant as "member of N tenants" → `400 Ambiguous
  tenant`. If team endpoints 400 once a tenant has 2+ members, check this filter.
- Multi-tenant users must pass `x-tenant-id` header to disambiguate.

## Devin Secrets Needed
- None for local testing. Local Supabase anon/service-role keys are deterministic
  and come from `supabase status`. Only a hosted deploy needs real project keys
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
