# Fryva POS + Mini ERP Implementation Blueprint

This document translates the product requirements into a concrete execution blueprint for a production-grade system built with **Next.js + Supabase + Vercel**.

## 1) Product Architecture

### Frontend (Next.js App Router)
- **Framework:** Next.js (TypeScript)
- **UI:** Tailwind CSS + shadcn/ui
- **Forms/Validation:** React Hook Form + Zod
- **Tables:** TanStack Table
- **Charts:** Recharts
- **Session/Auth:** Supabase Auth helpers (server + client)
- **Pattern:** Server Components for data-heavy pages; Client Components for POS interactions

### Backend (Supabase)
- **Database:** Postgres + SQL migrations
- **Auth:** Supabase Auth with `profiles` linked to `auth.users`
- **Security:** Row Level Security enabled on all business tables
- **Business logic:** SQL functions (RPC) for transactional workflows
- **Auditability:** Immutable audit logs + ledger entries

### Deployment
- **Frontend:** Vercel
- **Backend/DB:** Supabase
- **Environments:** dev/staging/prod projects with separate secrets

---

## 2) Core Domain Model (Normalized)

## Identity & Access
- `roles`
- `profiles`
- `user_role_assignments`

## Product & Inventory
- `menu_categories`
- `menu_items`
- `stock_movements`
- `opening_stock_entries`
- `stock_production_entries`
- `purchase_items`

## Sales & Debts
- `sales`
- `sale_items`
- `debtors`
- `debts`
- `debt_payments`
- `sale_corrections`

## Finance
- `expenses`
- `purchases`
- `ledger_accounts` (cash, mpesa, debt_receivable)
- `ledger_entries` (immutable double-entry style)

## Reporting & Operations
- `daily_closings`
- `settings`
- `audit_logs`

---

## 3) Key Financial Rules

1. **Cash sale** → credit cash ledger.
2. **Mpesa sale** → credit mpesa ledger.
3. **Debt sale** → credit debt receivable ledger.
4. **Cash expense/purchase** → debit cash ledger.
5. **Mpesa expense/purchase** → debit mpesa ledger.
6. **Debt payment (cash/mpesa)** → debit debt receivable + credit selected wallet.

All financial events are immutable ledger entries and are linked to source records (sale, payment, expense, purchase).

---

## 4) Transactional Workflows (RPC-first)

### `finalize_sale(payload)`
Atomic transaction:
1. Validate user permission (owner/waiter).
2. Validate menu item activity/pricing snapshot.
3. Insert `sales` row.
4. Insert `sale_items` rows.
5. If debt payment method:
   - upsert `debtors`
   - create `debts`
   - ledger: increase receivable
6. Else:
   - ledger: increase cash or mpesa
7. Insert stock movement rows for tracked items.
8. Insert `audit_logs` event.
9. Return sale summary.

### `record_debt_payment(payload)`
Atomic transaction:
1. Validate waiter ownership or owner role.
2. Insert `debt_payments`.
3. Update debt outstanding + status.
4. Ledger: reduce receivable + increase cash/mpesa.
5. Insert audit event.

### `request_sale_correction(payload)` and `approve_sale_correction(payload)`
- Waiter requests; owner approves/voids/adjusts with reason.
- Changes generate compensating ledger + stock movement entries.
- Never hard-delete finalized records.

---

## 5) RLS Strategy

- Deny by default; enable table-by-table policies.
- `profiles.role` derived from role assignment.

### Role summary
- **Owner:** full access
- **Waiter:** own sales, own debts/debt payments, menu read, POS create
- **Chef:** stock/opening/production + optional kitchen expense only

### Policy examples
- `sales SELECT`:
  - owner: all
  - waiter: `created_by = auth.uid()`
- `debts SELECT`:
  - owner: all
  - waiter: `assigned_waiter_id = auth.uid()`
- `menu_items UPDATE`:
  - owner only
- `opening_stock_entries INSERT`:
  - chef + owner

Critical writes happen via `security definer` SQL functions with strict role checks.

---

## 6) App Route Structure (Next.js)

```text
app/
  (auth)/login
  (dashboard)/
    owner/
      page.tsx
      sales/page.tsx
      debts/page.tsx
      inventory/page.tsx
      purchases/page.tsx
      expenses/page.tsx
      reports/page.tsx
      users/page.tsx
      settings/page.tsx
    waiter/
      page.tsx
      pos/page.tsx
      debts/page.tsx
      history/page.tsx
    chef/
      page.tsx
      opening-stock/page.tsx
      production/page.tsx
      kitchen-expenses/page.tsx
  api/
    reports/export/route.ts
    webhooks/supabase/route.ts
```

Shared component groups:
- `components/pos/*`
- `components/tables/*`
- `components/charts/*`
- `components/forms/*`
- `components/layout/*`

---

## 7) Dashboard by Role

### Owner Dashboard
- KPI cards: revenue, expenses, net, cash, mpesa, debt outstanding
- Trend charts: revenue/expense/profit, payment mix
- Tables: recent sales, recent expenses, debt follow-up, top items, top waiters

### Waiter Dashboard
- Quick POS launch
- Today totals by payment method
- Debts outstanding + collection stats
- Recent transactions

### Chef Dashboard
- Opening stock quick form
- Production quick form
- Kitchen expenses
- Kitchen daily snapshot

---

## 8) Analytics Strategy

- Reporting views:
  - `vw_daily_financials`
  - `vw_sales_by_item`
  - `vw_sales_by_waiter`
  - `vw_debt_aging`
- Optional materialized views for heavy windows (3m, 6m, yearly)
- Cache read-only analytics responses briefly while keeping ledger writes real-time

---

## 9) Audit Logging Strategy

Each sensitive event stores:
- actor id
- entity type/id
- action (`create|update|void|payment|correction_approve`)
- before snapshot (jsonb)
- after snapshot (jsonb)
- reason/notes
- request metadata (ip, user-agent)
- timestamp

Retention: long-term; never mutate historical rows.

---

## 10) Phase-by-Phase Build Plan

### Phase 1: Foundation
- Auth + roles + profile management
- Menu item CRUD (owner only)
- Owner starter dashboard KPI shell

### Phase 2: POS
- Fast item tile POS UI
- Cart, checkout, payment method flow
- Transactional `finalize_sale`

### Phase 3: Debts
- Debt listing/filtering
- Repayment workflow
- Debt analytics widgets

### Phase 4: Chef + Stock
- Opening stock, production entries
- Kitchen summaries
- Stock movement integration

### Phase 5: Purchases + Expenses
- Owner purchases/expenses workflows
- Immediate ledger updates

### Phase 6: Reporting
- Daily, 7d, month, 3m, 6m, yearly + custom range
- Export CSV

### Phase 7: Hardening
- Correction approvals
- Strong audit surfaces
- Performance tuning + mobile polish

---

## 11) Success Criteria (Non-negotiables)

- Role boundaries hold under RLS and server checks.
- Debt lifecycle is accurate and auditable.
- Cash and mpesa are always separate ledgers.
- Expenses/purchases immediately impact balances.
- Owner can read profitability and operational health at a glance.
