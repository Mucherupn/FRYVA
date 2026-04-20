# Companion Prompt for Codex (Technical Build Prompt)

Use this prompt after the business requirement prompt to force concrete implementation details.

---

You are implementing Fryva POS in an existing Next.js + Supabase codebase.

## Deliverables required in this order
1. SQL schema migration files (tables, enums, indexes, constraints)
2. RLS policy migration files
3. SQL functions/RPC for critical transactions
4. Next.js route map and page scaffolds by role
5. Shared UI/component scaffolds
6. End-to-end workflows for sales, debt payments, stock, expenses
7. Seed script for demo users/menu data
8. Test plan + smoke checklist

## Hard constraints
- Never bypass RLS.
- Never write financial records outside transactional functions.
- Ledger entries must be immutable.
- No hard delete for finalized sales/debts/payments.
- Waiter sees only own sales/debts; chef cannot access sales pages.

## Exact schema requirements
Create these enums:
- `app_role`: `owner`, `waiter`, `chef`, `manager`, `cashier`, `accountant`
- `payment_method`: `cash`, `mpesa`, `debt`
- `debt_status`: `unpaid`, `partial`, `paid`, `written_off`
- `ledger_account_type`: `cash`, `mpesa`, `debt_receivable`
- `audit_action`: `create`, `update`, `void`, `approve`, `payment`, `login`, `status_change`

Create these tables (minimum columns):
- `profiles(id uuid pk references auth.users, full_name, phone, active, created_at, created_by)`
- `roles(id, role app_role unique)`
- `user_role_assignments(id, user_id, role app_role, assigned_by, assigned_at)`
- `menu_categories(id, name, active)`
- `menu_items(id, name, category_id, selling_price numeric, cost_price numeric null, stock_tracked bool, active bool, kitchen_item bool, reorder_level numeric null, created_at)`
- `sales(id, sale_number unique, sold_by, sold_at, subtotal, total, payment_method, note, status default 'finalized')`
- `sale_items(id, sale_id, menu_item_id, quantity, unit_price, line_total)`
- `debtors(id, full_name, phone, notes, created_at)`
- `debts(id, sale_id unique, debtor_id, assigned_waiter_id, original_amount, remaining_amount, status debt_status, created_at, updated_at)`
- `debt_payments(id, debt_id, amount, payment_method check != 'debt', received_by, received_at, note)`
- `opening_stock_entries(id, entry_date, menu_item_id, qty, entered_by, note)`
- `stock_production_entries(id, entry_date, menu_item_id, qty, entered_by, note)`
- `purchases(id, purchase_date, item_name, category, qty, unit, unit_cost, total_cost, payment_method, supplier, note, entered_by)`
- `expenses(id, expense_time, description, category, amount, payment_method, note, entered_by, source default 'owner')`
- `ledger_accounts(id, code unique, account_type ledger_account_type, active)`
- `ledger_entries(id, account_id, direction ('in'|'out'), amount, source_table, source_id, event_time, created_by)`
- `audit_logs(id, actor_id, action audit_action, entity_type, entity_id, before jsonb, after jsonb, reason, event_time)`
- `settings(id, business_name, currency default 'KES', timezone default 'Africa/Nairobi')`

## Index requirements
Add indexes for:
- all foreign keys
- `sales(sold_at)`
- `sales(sold_by, sold_at)`
- `debts(status, assigned_waiter_id)`
- `debt_payments(received_at)`
- `ledger_entries(event_time, account_id)`
- `menu_items(active, category_id)`

## Mandatory SQL functions (RPC)
Implement and use these:
1. `finalize_sale(payload jsonb)`
2. `record_debt_payment(payload jsonb)`
3. `create_expense(payload jsonb)`
4. `create_purchase(payload jsonb)`
5. `request_sale_void(payload jsonb)`
6. `approve_sale_void(payload jsonb)`

Each function must:
- validate role from `auth.uid()`
- execute atomically
- write ledger entries
- write audit logs
- return typed JSON with status + created ids

## RLS policy matrix
Generate explicit policy SQL for each table with comments:
- owner: full
- waiter: own sales/debts/debt_payments only
- chef: opening/prod/kitchen expense only
- read restrictions on analytics base tables

## Next.js App Router requirements
Create route scaffolds:
- `/owner`, `/owner/sales`, `/owner/debts`, `/owner/inventory`, `/owner/expenses`, `/owner/purchases`, `/owner/reports`, `/owner/users`, `/owner/settings`
- `/waiter`, `/waiter/pos`, `/waiter/debts`, `/waiter/history`
- `/chef`, `/chef/opening-stock`, `/chef/production`, `/chef/expenses`

Add middleware or layout guards for role-based routing.

## UI components required
- POS grid with large item tiles and quick search
- cart drawer with quantity controls and totals
- checkout modal with payment mode and debt fields
- debt payment modal
- owner KPI cards + charts
- reusable data table with filters and CSV export

## Reporting requirements
Implement queries/endpoints for:
- daily summary
- last 7 days
- monthly
- last 3 months
- last 6 months
- yearly
- custom range

Metrics:
- revenue, expenses, net position
- cash sales, mpesa sales, debt sales
- debt collected, debt outstanding
- top items, top waiters, transactions, average order value

## Output format expected from you
1. `ARCHITECTURE.md`
2. `supabase/migrations/*.sql`
3. `app/**` route files
4. `components/**`
5. `lib/**` service and validation layers
6. `README.md` runbook with setup + phase status

Work in small, verifiable commits. After each phase, list what is complete and what remains.
