-- Phase 1 foundational schema for Fryva POS
create extension if not exists pgcrypto;

create type public.app_role as enum ('owner', 'waiter', 'chef', 'manager', 'cashier', 'accountant');
create type public.payment_method as enum ('cash', 'mpesa', 'debt');
create type public.debt_status as enum ('unpaid', 'partial', 'paid', 'written_off');
create type public.ledger_account_type as enum ('cash', 'mpesa', 'debt_receivable');
create type public.audit_action as enum ('create', 'update', 'void', 'approve', 'payment', 'login', 'status_change');
create type public.sale_status as enum ('finalized', 'void_requested', 'voided');
create type public.ledger_direction as enum ('in', 'out');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table public.roles (
  id bigserial primary key,
  role public.app_role not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table public.user_role_assignments (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now(),
  unique (user_id, role)
);

create table public.menu_categories (
  id bigserial primary key,
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.menu_items (
  id bigserial primary key,
  name text not null,
  category_id bigint not null references public.menu_categories(id),
  selling_price numeric(12,2) not null check (selling_price >= 0),
  cost_price numeric(12,2) check (cost_price >= 0),
  stock_tracked boolean not null default false,
  active boolean not null default true,
  kitchen_item boolean not null default false,
  reorder_level numeric(12,2) check (reorder_level >= 0),
  created_at timestamptz not null default now(),
  unique (name, category_id)
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_number text not null unique,
  sold_by uuid not null references auth.users(id),
  sold_at timestamptz not null default now(),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  total numeric(12,2) not null check (total >= 0),
  payment_method public.payment_method not null,
  note text,
  status public.sale_status not null default 'finalized'
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  menu_item_id bigint not null references public.menu_items(id),
  quantity numeric(12,2) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);

create table public.debtors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null unique references public.sales(id),
  debtor_id uuid not null references public.debtors(id),
  assigned_waiter_id uuid not null references auth.users(id),
  original_amount numeric(12,2) not null check (original_amount >= 0),
  remaining_amount numeric(12,2) not null check (remaining_amount >= 0),
  status public.debt_status not null default 'unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debts(id),
  amount numeric(12,2) not null check (amount > 0),
  payment_method public.payment_method not null,
  received_by uuid not null references auth.users(id),
  received_at timestamptz not null default now(),
  note text,
  check (payment_method <> 'debt')
);

create table public.opening_stock_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  menu_item_id bigint not null references public.menu_items(id),
  qty numeric(12,2) not null check (qty >= 0),
  entered_by uuid not null references auth.users(id),
  note text,
  created_at timestamptz not null default now()
);

create table public.stock_production_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  menu_item_id bigint not null references public.menu_items(id),
  qty numeric(12,2) not null check (qty >= 0),
  entered_by uuid not null references auth.users(id),
  note text,
  created_at timestamptz not null default now()
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_date date not null,
  item_name text not null,
  category text,
  qty numeric(12,2) not null check (qty > 0),
  unit text not null,
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  total_cost numeric(12,2) not null check (total_cost >= 0),
  payment_method public.payment_method not null,
  supplier text,
  note text,
  entered_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (payment_method <> 'debt')
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_time timestamptz not null default now(),
  description text not null,
  category text,
  amount numeric(12,2) not null check (amount > 0),
  payment_method public.payment_method not null,
  note text,
  entered_by uuid not null references auth.users(id),
  source text not null default 'owner',
  created_at timestamptz not null default now(),
  check (payment_method <> 'debt')
);

create table public.ledger_accounts (
  id bigserial primary key,
  code text not null unique,
  account_type public.ledger_account_type not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  account_id bigint not null references public.ledger_accounts(id),
  direction public.ledger_direction not null,
  amount numeric(12,2) not null check (amount > 0),
  source_table text not null,
  source_id uuid not null,
  event_time timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  action public.audit_action not null,
  entity_type text not null,
  entity_id text not null,
  before jsonb,
  after jsonb,
  reason text,
  event_time timestamptz not null default now()
);

create table public.settings (
  id boolean primary key default true check (id = true),
  business_name text not null,
  currency text not null default 'KES',
  timezone text not null default 'Africa/Nairobi',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Helpful auth role lookup helpers
create or replace function public.user_has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.user_role_assignments ura
    where ura.user_id = _user_id
      and ura.role = _role
  );
$$;

create or replace function public.current_user_has_role(_role public.app_role)
returns boolean
language sql
stable
as $$
  select public.user_has_role(auth.uid(), _role);
$$;

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1), 'New User'),
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_auth_user_created();

-- Keep debt and settings timestamps fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_debts_set_updated_at
before update on public.debts
for each row
execute function public.set_updated_at();

create trigger trg_settings_set_updated_at
before update on public.settings
for each row
execute function public.set_updated_at();

-- indexes
create index idx_profiles_created_by on public.profiles(created_by);
create index idx_user_role_assignments_user_id on public.user_role_assignments(user_id);
create index idx_user_role_assignments_assigned_by on public.user_role_assignments(assigned_by);
create index idx_menu_items_category_id on public.menu_items(category_id);
create index idx_sales_sold_by on public.sales(sold_by);
create index idx_sales_sold_at on public.sales(sold_at);
create index idx_sales_sold_by_sold_at on public.sales(sold_by, sold_at desc);
create index idx_sale_items_sale_id on public.sale_items(sale_id);
create index idx_sale_items_menu_item_id on public.sale_items(menu_item_id);
create index idx_debts_debtor_id on public.debts(debtor_id);
create index idx_debts_assigned_waiter_id on public.debts(assigned_waiter_id);
create index idx_debts_status_assigned_waiter on public.debts(status, assigned_waiter_id);
create index idx_debt_payments_debt_id on public.debt_payments(debt_id);
create index idx_debt_payments_received_by on public.debt_payments(received_by);
create index idx_debt_payments_received_at on public.debt_payments(received_at);
create index idx_opening_stock_entries_menu_item_id on public.opening_stock_entries(menu_item_id);
create index idx_opening_stock_entries_entered_by on public.opening_stock_entries(entered_by);
create index idx_stock_production_entries_menu_item_id on public.stock_production_entries(menu_item_id);
create index idx_stock_production_entries_entered_by on public.stock_production_entries(entered_by);
create index idx_purchases_entered_by on public.purchases(entered_by);
create index idx_expenses_entered_by on public.expenses(entered_by);
create index idx_ledger_entries_account_id on public.ledger_entries(account_id);
create index idx_ledger_entries_created_by on public.ledger_entries(created_by);
create index idx_ledger_entries_event_time_account_id on public.ledger_entries(event_time, account_id);
create index idx_audit_logs_actor_id on public.audit_logs(actor_id);
create index idx_menu_items_active_category_id on public.menu_items(active, category_id);
