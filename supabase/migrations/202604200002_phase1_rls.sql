-- Phase 1 RLS policies (deny-by-default with explicit grants)

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.user_role_assignments enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.debtors enable row level security;
alter table public.debts enable row level security;
alter table public.debt_payments enable row level security;
alter table public.opening_stock_entries enable row level security;
alter table public.stock_production_entries enable row level security;
alter table public.purchases enable row level security;
alter table public.expenses enable row level security;
alter table public.ledger_accounts enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.audit_logs enable row level security;
alter table public.settings enable row level security;

-- Base role table: all authenticated users may see role catalog.
create policy "roles_select_authenticated" on public.roles
for select to authenticated
using (true);

-- Profiles: users can read/update self; owner can manage all.
create policy "profiles_select_self_or_owner" on public.profiles
for select to authenticated
using (id = auth.uid() or public.current_user_has_role('owner'));

create policy "profiles_update_self_or_owner" on public.profiles
for update to authenticated
using (id = auth.uid() or public.current_user_has_role('owner'))
with check (id = auth.uid() or public.current_user_has_role('owner'));

create policy "profiles_insert_owner_only" on public.profiles
for insert to authenticated
with check (public.current_user_has_role('owner'));

-- Role assignments: owner only
create policy "user_role_assignments_owner_all" on public.user_role_assignments
for all to authenticated
using (public.current_user_has_role('owner'))
with check (public.current_user_has_role('owner'));

-- Menu visibility: everyone can read active items/categories.
create policy "menu_categories_select_authenticated" on public.menu_categories
for select to authenticated
using (true);

create policy "menu_categories_owner_manage" on public.menu_categories
for all to authenticated
using (public.current_user_has_role('owner'))
with check (public.current_user_has_role('owner'));

create policy "menu_items_select_authenticated" on public.menu_items
for select to authenticated
using (true);

create policy "menu_items_owner_manage" on public.menu_items
for all to authenticated
using (public.current_user_has_role('owner'))
with check (public.current_user_has_role('owner'));

-- Sales: owner all, waiter own.
create policy "sales_select_owner_or_waiter_own" on public.sales
for select to authenticated
using (
  public.current_user_has_role('owner')
  or (public.current_user_has_role('waiter') and sold_by = auth.uid())
);

create policy "sales_insert_owner_or_waiter" on public.sales
for insert to authenticated
with check (
  public.current_user_has_role('owner')
  or (public.current_user_has_role('waiter') and sold_by = auth.uid())
);

create policy "sales_update_owner_only" on public.sales
for update to authenticated
using (public.current_user_has_role('owner'))
with check (public.current_user_has_role('owner'));

-- Sale items follow parent sale visibility.
create policy "sale_items_select_owner_or_waiter_own" on public.sale_items
for select to authenticated
using (
  exists (
    select 1 from public.sales s
    where s.id = sale_id
      and (
        public.current_user_has_role('owner')
        or (public.current_user_has_role('waiter') and s.sold_by = auth.uid())
      )
  )
);

create policy "sale_items_insert_owner_or_waiter_own" on public.sale_items
for insert to authenticated
with check (
  exists (
    select 1 from public.sales s
    where s.id = sale_id
      and (
        public.current_user_has_role('owner')
        or (public.current_user_has_role('waiter') and s.sold_by = auth.uid())
      )
  )
);

-- Debtor records tied to debts; owner full and waiter if assigned.
create policy "debtors_select_owner_or_waiter_assigned" on public.debtors
for select to authenticated
using (
  public.current_user_has_role('owner')
  or exists (
    select 1
    from public.debts d
    where d.debtor_id = debtors.id
      and d.assigned_waiter_id = auth.uid()
      and public.current_user_has_role('waiter')
  )
);

create policy "debtors_insert_owner_or_waiter" on public.debtors
for insert to authenticated
with check (public.current_user_has_role('owner') or public.current_user_has_role('waiter'));

create policy "debts_select_owner_or_waiter_own" on public.debts
for select to authenticated
using (
  public.current_user_has_role('owner')
  or (public.current_user_has_role('waiter') and assigned_waiter_id = auth.uid())
);

create policy "debts_insert_owner_or_waiter_own" on public.debts
for insert to authenticated
with check (
  public.current_user_has_role('owner')
  or (public.current_user_has_role('waiter') and assigned_waiter_id = auth.uid())
);

create policy "debts_update_owner_or_waiter_own" on public.debts
for update to authenticated
using (
  public.current_user_has_role('owner')
  or (public.current_user_has_role('waiter') and assigned_waiter_id = auth.uid())
)
with check (
  public.current_user_has_role('owner')
  or (public.current_user_has_role('waiter') and assigned_waiter_id = auth.uid())
);

create policy "debt_payments_select_owner_or_waiter_assigned" on public.debt_payments
for select to authenticated
using (
  public.current_user_has_role('owner')
  or (
    public.current_user_has_role('waiter')
    and exists (
      select 1 from public.debts d
      where d.id = debt_id
      and d.assigned_waiter_id = auth.uid()
    )
  )
);

create policy "debt_payments_insert_owner_or_waiter_assigned" on public.debt_payments
for insert to authenticated
with check (
  public.current_user_has_role('owner')
  or (
    public.current_user_has_role('waiter')
    and received_by = auth.uid()
    and exists (
      select 1 from public.debts d
      where d.id = debt_id
      and d.assigned_waiter_id = auth.uid()
    )
  )
);

-- Inventory operations: chef + owner
create policy "opening_stock_entries_select_chef_or_owner" on public.opening_stock_entries
for select to authenticated
using (public.current_user_has_role('chef') or public.current_user_has_role('owner'));

create policy "opening_stock_entries_insert_chef_or_owner" on public.opening_stock_entries
for insert to authenticated
with check (
  (public.current_user_has_role('chef') or public.current_user_has_role('owner'))
  and entered_by = auth.uid()
);

create policy "stock_production_entries_select_chef_or_owner" on public.stock_production_entries
for select to authenticated
using (public.current_user_has_role('chef') or public.current_user_has_role('owner'));

create policy "stock_production_entries_insert_chef_or_owner" on public.stock_production_entries
for insert to authenticated
with check (
  (public.current_user_has_role('chef') or public.current_user_has_role('owner'))
  and entered_by = auth.uid()
);

-- Purchases and expenses in phase 1 are owner-only (chef expenses can be allowed by source in later phase).
create policy "purchases_owner_all" on public.purchases
for all to authenticated
using (public.current_user_has_role('owner'))
with check (public.current_user_has_role('owner'));

create policy "expenses_select_owner_or_chef_own" on public.expenses
for select to authenticated
using (
  public.current_user_has_role('owner')
  or (public.current_user_has_role('chef') and entered_by = auth.uid())
);

create policy "expenses_insert_owner_or_chef_own" on public.expenses
for insert to authenticated
with check (
  (public.current_user_has_role('owner') or public.current_user_has_role('chef'))
  and entered_by = auth.uid()
);

-- Ledger/audit/settings are owner-only reads and writes via RPC in later phases.
create policy "ledger_accounts_owner_all" on public.ledger_accounts
for all to authenticated
using (public.current_user_has_role('owner'))
with check (public.current_user_has_role('owner'));

create policy "ledger_entries_owner_all" on public.ledger_entries
for all to authenticated
using (public.current_user_has_role('owner'))
with check (public.current_user_has_role('owner'));

create policy "audit_logs_owner_all" on public.audit_logs
for all to authenticated
using (public.current_user_has_role('owner'))
with check (public.current_user_has_role('owner'));

create policy "settings_owner_all" on public.settings
for all to authenticated
using (public.current_user_has_role('owner'))
with check (public.current_user_has_role('owner'));
