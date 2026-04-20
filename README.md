# Fryva POS (Phase 1)

This repository now contains **Phase 1** implementation foundations for the Fryva POS stack using Next.js + Supabase.

## Completed in Phase 1

- Supabase schema migration with enums, tables, FKs, constraints, indexes.
- RLS migration with explicit owner/waiter/chef policy matrix.
- Seed migration for roles, ledger accounts, menu categories/items, settings.
- Supabase Auth integration helpers for browser/server/middleware.
- Role-aware guards and protected routes in Next.js middleware.
- Login flow scaffold.
- Owner-only user management page with create user and role update actions.
- Basic dashboard shell for owner, waiter, and chef plus route scaffolds.

## Remaining for next phases

- Transactional RPC functions: finalize sale, debt payment, purchases, expenses, sale corrections.
- Full POS sales/debt workflows and inventory operational flows.
- Ledger write orchestration and immutable financial event engine.
- Rich analytics pages, reporting APIs, and charts.
- Expanded chef stock workflows and purchases/ledger business logic.

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (required for owner user management actions)

