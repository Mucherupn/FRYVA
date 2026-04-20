-- Phase 5: correction/void workflows, reconciliation, immutable financial history, performance hardening, and end-of-day controls

-- ---------------------------
-- Immutable + correction model
-- ---------------------------

alter table public.sales add column if not exists corrected_by uuid references auth.users(id);
alter table public.sales add column if not exists corrected_at timestamptz;
alter table public.sales add column if not exists correction_reason text;

alter table public.purchases add column if not exists status text not null default 'active' check (status in ('active', 'voided'));
alter table public.purchases add column if not exists corrected_by uuid references auth.users(id);
alter table public.purchases add column if not exists corrected_at timestamptz;
alter table public.purchases add column if not exists correction_reason text;

alter table public.expenses add column if not exists status text not null default 'active' check (status in ('active', 'voided'));
alter table public.expenses add column if not exists corrected_by uuid references auth.users(id);
alter table public.expenses add column if not exists corrected_at timestamptz;
alter table public.expenses add column if not exists correction_reason text;

create table if not exists public.financial_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  source_table text not null,
  source_id uuid not null,
  direction public.ledger_direction not null,
  payment_method public.payment_method,
  amount numeric(12,2) not null check (amount > 0),
  occurred_at timestamptz not null default now(),
  actor_id uuid not null references auth.users(id),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  reversal_of uuid references public.financial_events(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_financial_events_occurred_at on public.financial_events(occurred_at desc);
create index if not exists idx_financial_events_entity on public.financial_events(entity_type, entity_id);
create index if not exists idx_financial_events_source on public.financial_events(source_table, source_id);
create index if not exists idx_financial_events_payment_method on public.financial_events(payment_method, occurred_at desc);

create table if not exists public.daily_closures (
  id uuid primary key default gen_random_uuid(),
  close_date date not null unique,
  closed_by uuid not null references auth.users(id),
  closed_at timestamptz not null default now(),
  summary_snapshot jsonb not null,
  reconciliation_note text,
  status text not null default 'closed' check (status in ('closed', 'reopened'))
);

create index if not exists idx_daily_closures_close_date on public.daily_closures(close_date desc);

create table if not exists public.reconciliation_sessions (
  id uuid primary key default gen_random_uuid(),
  recon_type text not null check (recon_type in ('cash', 'mpesa')),
  recon_date date not null default current_date,
  expected_balance numeric(12,2) not null,
  actual_balance numeric(12,2) not null,
  variance numeric(12,2) not null,
  note text,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_reconciliation_sessions_type_date on public.reconciliation_sessions(recon_type, recon_date desc);

create table if not exists public.debt_write_offs (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.debts(id),
  amount numeric(12,2) not null check (amount > 0),
  reason text not null,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_debt_write_offs_debt on public.debt_write_offs(debt_id, created_at desc);

create or replace function public.prevent_financial_history_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    raise exception 'Immutable financial history. Use correction/reversal workflows.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_financial_events_immutable on public.financial_events;
create trigger trg_financial_events_immutable
before update or delete on public.financial_events
for each row execute function public.prevent_financial_history_mutation();

drop trigger if exists trg_ledger_entries_immutable on public.ledger_entries;
create trigger trg_ledger_entries_immutable
before update or delete on public.ledger_entries
for each row execute function public.prevent_financial_history_mutation();

-- blocking late transactional entries on closed day unless owner
create or replace function public.assert_day_not_closed(_day date, _allow_owner boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_closed boolean;
begin
  select exists(select 1 from public.daily_closures dc where dc.close_date = _day and dc.status = 'closed') into v_closed;
  if not v_closed then
    return;
  end if;

  if _allow_owner and v_actor_id is not null and public.user_has_role(v_actor_id, 'owner') then
    return;
  end if;

  raise exception 'Date % is already closed. Use owner correction workflow.', _day;
end;
$$;

-- ---------------------------
-- performance/reporting views
-- ---------------------------

create or replace view public.v_ledger_balance_by_method as
select
  la.account_type,
  coalesce(sum(case when le.direction = 'in' then le.amount else -le.amount end), 0)::numeric(12,2) as balance
from public.ledger_accounts la
left join public.ledger_entries le on le.account_id = la.id
group by la.account_type;

create or replace view public.v_debt_aging as
select
  d.id as debt_id,
  d.debtor_id,
  db.full_name as debtor_name,
  d.assigned_waiter_id,
  d.original_amount,
  d.remaining_amount,
  d.status,
  d.created_at,
  case
    when d.status = 'paid' then 'paid'
    when d.created_at::date = current_date then 'today'
    when d.created_at::date >= current_date - interval '7 days' then '1_7_days'
    when d.created_at::date >= current_date - interval '30 days' then '8_30_days'
    else 'over_30_days'
  end as aging_bucket
from public.debts d
join public.debtors db on db.id = d.debtor_id;

create index if not exists idx_sales_payment_method_sold_at on public.sales(payment_method, sold_at desc);
create index if not exists idx_sales_status_sold_at on public.sales(status, sold_at desc);
create index if not exists idx_debts_status_created_at on public.debts(status, created_at desc);
create index if not exists idx_purchases_status_purchase_date on public.purchases(status, purchase_date desc);
create index if not exists idx_expenses_status_expense_time on public.expenses(status, expense_time desc);
create index if not exists idx_sale_items_menu_item_sale on public.sale_items(menu_item_id, sale_id);

-- ---------------------------
-- Hardened RPCs
-- ---------------------------

create or replace function public.record_financial_event(
  _event_type text,
  _entity_type text,
  _entity_id text,
  _source_table text,
  _source_id uuid,
  _direction public.ledger_direction,
  _payment_method public.payment_method,
  _amount numeric,
  _reason text,
  _metadata jsonb default '{}'::jsonb,
  _reversal_of uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_event_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Authentication required';
  end if;

  if _amount is null or _amount <= 0 then
    raise exception 'Financial event amount must be positive';
  end if;

  insert into public.financial_events (
    event_type,
    entity_type,
    entity_id,
    source_table,
    source_id,
    direction,
    payment_method,
    amount,
    actor_id,
    reason,
    metadata,
    reversal_of
  )
  values (
    _event_type,
    _entity_type,
    _entity_id,
    _source_table,
    _source_id,
    _direction,
    _payment_method,
    _amount,
    v_actor_id,
    _reason,
    coalesce(_metadata, '{}'::jsonb),
    _reversal_of
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.finalize_sale(_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role_waiter boolean;
  v_role_owner boolean;
  v_sold_by uuid;
  v_payment_method public.payment_method;
  v_note text;
  v_items jsonb;
  v_item jsonb;
  v_menu_item_id bigint;
  v_qty numeric(12,2);
  v_unit_price numeric(12,2);
  v_line_total numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_sale_id uuid;
  v_sale_number text;
  v_debtor_name text;
  v_debtor_phone text;
  v_debt_note text;
  v_debtor_id uuid;
  v_debt_id uuid;
  v_account_id bigint;
  v_sale_day date := current_date;
begin
  if v_actor_id is null then
    raise exception 'Authentication required';
  end if;

  perform public.assert_day_not_closed(v_sale_day, true);

  v_role_waiter := public.user_has_role(v_actor_id, 'waiter');
  v_role_owner := public.user_has_role(v_actor_id, 'owner');
  if not (v_role_waiter or v_role_owner) then
    raise exception 'Only owner/waiter can finalize sales';
  end if;

  v_sold_by := coalesce((_payload ->> 'sold_by')::uuid, v_actor_id);
  if v_role_waiter and v_sold_by <> v_actor_id then
    raise exception 'Waiter can only create sale as self';
  end if;

  v_payment_method := (_payload ->> 'payment_method')::public.payment_method;
  if v_payment_method is null then
    raise exception 'payment_method is required';
  end if;

  v_note := nullif(_payload ->> 'note', '');
  v_items := _payload -> 'items';
  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'At least one sale item is required';
  end if;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_menu_item_id := (v_item ->> 'menu_item_id')::bigint;
    v_qty := (v_item ->> 'quantity')::numeric;
    if v_menu_item_id is null or v_qty is null or v_qty <= 0 then
      raise exception 'Invalid sale item payload';
    end if;

    select mi.selling_price into v_unit_price from public.menu_items mi where mi.id = v_menu_item_id and mi.active = true;
    if v_unit_price is null then
      raise exception 'Menu item % is inactive/missing', v_menu_item_id;
    end if;
    v_line_total := round(v_unit_price * v_qty, 2);
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  v_subtotal := round(v_subtotal, 2);
  v_sale_number := concat('SAL-', to_char(now(), 'YYYYMMDD'), '-', lpad(nextval('public.sale_number_seq')::text, 6, '0'));

  insert into public.sales (sale_number, sold_by, subtotal, total, payment_method, note)
  values (v_sale_number, v_sold_by, v_subtotal, v_subtotal, v_payment_method, v_note)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_menu_item_id := (v_item ->> 'menu_item_id')::bigint;
    v_qty := (v_item ->> 'quantity')::numeric;
    select mi.selling_price into v_unit_price from public.menu_items mi where mi.id = v_menu_item_id;
    v_line_total := round(v_unit_price * v_qty, 2);
    insert into public.sale_items (sale_id, menu_item_id, quantity, unit_price, line_total)
    values (v_sale_id, v_menu_item_id, v_qty, v_unit_price, v_line_total);
  end loop;

  if v_payment_method in ('cash', 'mpesa') then
    select la.id into v_account_id from public.ledger_accounts la
    where la.account_type = case when v_payment_method = 'cash' then 'cash'::public.ledger_account_type else 'mpesa'::public.ledger_account_type end
      and la.active = true
    limit 1;

    if v_account_id is null then
      raise exception 'Missing active % ledger account', v_payment_method;
    end if;

    insert into public.ledger_entries (account_id, direction, amount, source_table, source_id, created_by)
    values (v_account_id, 'in', v_subtotal, 'sales', v_sale_id, v_actor_id);

    perform public.record_financial_event('sale_posted', 'sale', v_sale_id::text, 'sales', v_sale_id, 'in', v_payment_method, v_subtotal, v_note, jsonb_build_object('sale_number', v_sale_number));
  else
    v_debtor_name := nullif(_payload ->> 'debtor_name', '');
    if v_debtor_name is null then
      raise exception 'debtor_name is required for debt sale';
    end if;

    v_debtor_phone := nullif(_payload ->> 'debtor_phone', '');
    v_debt_note := nullif(_payload ->> 'debt_note', '');

    insert into public.debtors (full_name, phone, notes) values (v_debtor_name, v_debtor_phone, v_debt_note) returning id into v_debtor_id;
    insert into public.debts (sale_id, debtor_id, assigned_waiter_id, original_amount, remaining_amount, status)
    values (v_sale_id, v_debtor_id, v_sold_by, v_subtotal, v_subtotal, 'unpaid') returning id into v_debt_id;

    perform public.record_financial_event('sale_debt_created', 'sale', v_sale_id::text, 'sales', v_sale_id, 'in', 'debt'::public.payment_method, v_subtotal, v_note, jsonb_build_object('debt_id', v_debt_id));
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after, reason)
  values (v_actor_id, 'create', 'sale', v_sale_id::text,
    jsonb_build_object('sale_id', v_sale_id, 'sale_number', v_sale_number, 'payment_method', v_payment_method, 'total', v_subtotal, 'debt_id', v_debt_id), v_note);

  return jsonb_build_object('sale_id', v_sale_id, 'sale_number', v_sale_number, 'total', v_subtotal, 'payment_method', v_payment_method, 'debt_id', v_debt_id);
end;
$$;

create or replace function public.record_debt_payment(_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role_waiter boolean;
  v_role_owner boolean;
  v_debt_id uuid := (_payload ->> 'debt_id')::uuid;
  v_amount numeric(12,2) := (_payload ->> 'amount')::numeric;
  v_payment_method public.payment_method := (_payload ->> 'payment_method')::public.payment_method;
  v_note text := nullif(_payload ->> 'note', '');
  v_debt public.debts%rowtype;
  v_remaining numeric(12,2);
  v_status public.debt_status;
  v_payment_id uuid;
  v_account_id bigint;
begin
  if v_actor_id is null then raise exception 'Authentication required'; end if;
  v_role_waiter := public.user_has_role(v_actor_id, 'waiter');
  v_role_owner := public.user_has_role(v_actor_id, 'owner');
  if not (v_role_waiter or v_role_owner) then raise exception 'Only owner/waiter can record debt payments'; end if;
  if v_debt_id is null then raise exception 'debt_id is required'; end if;
  if v_payment_method not in ('cash', 'mpesa') then raise exception 'payment_method must be cash or mpesa'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'amount must be > 0'; end if;

  select * into v_debt from public.debts d where d.id = v_debt_id for update;
  if not found then raise exception 'Debt not found'; end if;
  perform public.assert_day_not_closed(current_date, true);

  if v_role_waiter and v_debt.assigned_waiter_id <> v_actor_id then raise exception 'Waiter can only record payment for assigned debts'; end if;
  if v_amount > v_debt.remaining_amount then raise exception 'Payment amount exceeds remaining debt'; end if;

  insert into public.debt_payments (debt_id, amount, payment_method, received_by, note)
  values (v_debt_id, v_amount, v_payment_method, v_actor_id, v_note)
  returning id into v_payment_id;

  v_remaining := round(v_debt.remaining_amount - v_amount, 2);
  v_status := case when v_remaining = 0 then 'paid'::public.debt_status when v_remaining < v_debt.original_amount then 'partial'::public.debt_status else 'unpaid'::public.debt_status end;
  update public.debts set remaining_amount = v_remaining, status = v_status where id = v_debt_id;

  select la.id into v_account_id from public.ledger_accounts la
  where la.account_type = case when v_payment_method = 'cash' then 'cash'::public.ledger_account_type else 'mpesa'::public.ledger_account_type end and la.active = true
  limit 1;
  if v_account_id is null then raise exception 'Missing active % ledger account', v_payment_method; end if;

  insert into public.ledger_entries (account_id, direction, amount, source_table, source_id, created_by)
  values (v_account_id, 'in', v_amount, 'debt_payments', v_payment_id, v_actor_id);

  perform public.record_financial_event('debt_payment', 'debt', v_debt_id::text, 'debt_payments', v_payment_id, 'in', v_payment_method, v_amount, v_note,
    jsonb_build_object('payment_id', v_payment_id, 'remaining_amount', v_remaining, 'status', v_status));

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after, reason)
  values (v_actor_id, 'payment', 'debt', v_debt_id::text, jsonb_build_object('payment_id', v_payment_id, 'amount', v_amount, 'payment_method', v_payment_method, 'remaining_amount', v_remaining, 'status', v_status), v_note);

  return jsonb_build_object('debt_id', v_debt_id, 'payment_id', v_payment_id, 'remaining_amount', v_remaining, 'status', v_status);
end;
$$;

create or replace function public.record_expense(_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_is_chef boolean;
  v_is_owner boolean;
  v_description text := nullif(_payload ->> 'description', '');
  v_category text := nullif(_payload ->> 'category', '');
  v_amount numeric(12,2) := (_payload ->> 'amount')::numeric;
  v_payment_method public.payment_method := (_payload ->> 'payment_method')::public.payment_method;
  v_note text := nullif(_payload ->> 'note', '');
  v_expense_date date := coalesce((_payload ->> 'expense_date')::date, current_date);
  v_source text := coalesce(nullif(_payload ->> 'source', ''), 'owner');
  v_expense_time timestamptz;
  v_id uuid;
  v_account_id bigint;
begin
  if v_actor_id is null then raise exception 'Authentication required'; end if;
  perform public.assert_day_not_closed(v_expense_date, true);
  v_is_chef := public.user_has_role(v_actor_id, 'chef');
  v_is_owner := public.user_has_role(v_actor_id, 'owner');
  if not (v_is_chef or v_is_owner) then raise exception 'Only chef/owner can record expenses'; end if;
  if v_is_chef then v_source := 'chef'; end if;
  if v_description is null then raise exception 'description is required'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'amount must be > 0'; end if;
  if v_payment_method not in ('cash', 'mpesa') then raise exception 'payment_method must be cash or mpesa'; end if;

  v_expense_time := v_expense_date::timestamptz + (now()::time);
  insert into public.expenses (expense_time, description, category, amount, payment_method, note, entered_by, source)
  values (v_expense_time, v_description, v_category, v_amount, v_payment_method, v_note, v_actor_id, v_source)
  returning id into v_id;

  select la.id into v_account_id from public.ledger_accounts la
  where la.account_type = case when v_payment_method = 'cash' then 'cash'::public.ledger_account_type else 'mpesa'::public.ledger_account_type end and la.active = true
  limit 1;
  if v_account_id is null then raise exception 'Missing active % ledger account', v_payment_method; end if;

  insert into public.ledger_entries (account_id, direction, amount, source_table, source_id, created_by)
  values (v_account_id, 'out', v_amount, 'expenses', v_id, v_actor_id);

  perform public.record_financial_event('expense_posted', 'expense', v_id::text, 'expenses', v_id, 'out', v_payment_method, v_amount, v_note,
    jsonb_build_object('source', v_source, 'category', v_category));

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after, reason)
  values (v_actor_id, 'create', 'expense', v_id::text, jsonb_build_object('amount', v_amount, 'payment_method', v_payment_method, 'source', v_source), v_note);

  return jsonb_build_object('id', v_id, 'amount', v_amount, 'payment_method', v_payment_method, 'source', v_source);
end;
$$;

create or replace function public.record_purchase(_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_item_name text := nullif(_payload ->> 'item_name', '');
  v_category text := nullif(_payload ->> 'category', '');
  v_qty numeric(12,2) := (_payload ->> 'qty')::numeric;
  v_unit text := nullif(_payload ->> 'unit', '');
  v_unit_cost numeric(12,2) := (_payload ->> 'unit_cost')::numeric;
  v_total_cost numeric(12,2) := (_payload ->> 'total_cost')::numeric;
  v_supplier text := nullif(_payload ->> 'supplier', '');
  v_payment_method public.payment_method := (_payload ->> 'payment_method')::public.payment_method;
  v_note text := nullif(_payload ->> 'note', '');
  v_purchase_date date := coalesce((_payload ->> 'purchase_date')::date, current_date);
  v_menu_item_id bigint := (_payload ->> 'menu_item_id')::bigint;
  v_id uuid;
  v_account_id bigint;
  v_expected_total numeric(12,2);
begin
  if v_actor_id is null then raise exception 'Authentication required'; end if;
  perform public.assert_day_not_closed(v_purchase_date, true);
  if not public.user_has_role(v_actor_id, 'owner') then raise exception 'Only owner can record purchases'; end if;
  if v_item_name is null or v_unit is null then raise exception 'item_name and unit are required'; end if;
  if v_qty is null or v_qty <= 0 then raise exception 'qty must be > 0'; end if;
  if v_unit_cost is null or v_unit_cost < 0 then raise exception 'unit_cost must be >= 0'; end if;
  if v_total_cost is null or v_total_cost <= 0 then raise exception 'total_cost must be > 0'; end if;
  if v_payment_method not in ('cash', 'mpesa') then raise exception 'payment_method must be cash or mpesa'; end if;
  if v_menu_item_id is not null and not exists (select 1 from public.menu_items mi where mi.id = v_menu_item_id) then raise exception 'menu_item_id % not found', v_menu_item_id; end if;

  v_expected_total := round(v_qty * v_unit_cost, 2);
  if abs(v_expected_total - v_total_cost) > 0.02 then raise exception 'total_cost does not match qty x unit_cost'; end if;

  insert into public.purchases (purchase_date, item_name, menu_item_id, category, qty, unit, unit_cost, total_cost, payment_method, supplier, note, entered_by)
  values (v_purchase_date, v_item_name, v_menu_item_id, v_category, v_qty, v_unit, v_unit_cost, v_total_cost, v_payment_method, v_supplier, v_note, v_actor_id)
  returning id into v_id;

  select la.id into v_account_id from public.ledger_accounts la
  where la.account_type = case when v_payment_method = 'cash' then 'cash'::public.ledger_account_type else 'mpesa'::public.ledger_account_type end and la.active = true
  limit 1;
  if v_account_id is null then raise exception 'Missing active % ledger account', v_payment_method; end if;

  insert into public.ledger_entries (account_id, direction, amount, source_table, source_id, created_by)
  values (v_account_id, 'out', v_total_cost, 'purchases', v_id, v_actor_id);

  perform public.record_financial_event('purchase_posted', 'purchase', v_id::text, 'purchases', v_id, 'out', v_payment_method, v_total_cost, v_note,
    jsonb_build_object('item_name', v_item_name, 'menu_item_id', v_menu_item_id));

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after, reason)
  values (v_actor_id, 'create', 'purchase', v_id::text, jsonb_build_object('total_cost', v_total_cost, 'payment_method', v_payment_method, 'menu_item_id', v_menu_item_id), v_note);

  return jsonb_build_object('id', v_id, 'total_cost', v_total_cost, 'payment_method', v_payment_method, 'menu_item_id', v_menu_item_id);
end;
$$;

-- ---------------------------
-- Correction + void workflows
-- ---------------------------

create or replace function public.correct_or_void_sale(_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_sale_id uuid := (_payload ->> 'sale_id')::uuid;
  v_operation text := coalesce(nullif(_payload ->> 'operation', ''), 'void');
  v_reason text := nullif(_payload ->> 'reason', '');
  v_sale public.sales%rowtype;
  v_account_id bigint;
  v_payment_total numeric(12,2);
  v_reversal_payment_id uuid;
  v_orig_event_id uuid;
begin
  if v_actor_id is null then raise exception 'Authentication required'; end if;
  if not public.user_has_role(v_actor_id, 'owner') then raise exception 'Only owner can correct/void sales'; end if;
  if v_sale_id is null then raise exception 'sale_id is required'; end if;
  if v_reason is null then raise exception 'reason is required'; end if;

  select * into v_sale from public.sales s where s.id = v_sale_id for update;
  if not found then raise exception 'Sale not found'; end if;
  if v_sale.status = 'voided' then raise exception 'Sale already voided'; end if;

  if v_sale.payment_method in ('cash', 'mpesa') then
    select la.id into v_account_id from public.ledger_accounts la
    where la.account_type = case when v_sale.payment_method = 'cash' then 'cash'::public.ledger_account_type else 'mpesa'::public.ledger_account_type end and la.active = true
    limit 1;

    insert into public.ledger_entries (account_id, direction, amount, source_table, source_id, created_by)
    values (v_account_id, 'out', v_sale.total, 'sale_corrections', v_sale.id, v_actor_id);

    select fe.id into v_orig_event_id from public.financial_events fe
    where fe.source_table = 'sales' and fe.source_id = v_sale.id and fe.direction = 'in'
    order by fe.created_at asc
    limit 1;

    perform public.record_financial_event('sale_reversal', 'sale', v_sale.id::text, 'sale_corrections', v_sale.id, 'out', v_sale.payment_method, v_sale.total, v_reason,
      jsonb_build_object('operation', v_operation), v_orig_event_id);
  end if;

  if v_sale.payment_method = 'debt' then
    update public.debts
    set status = 'written_off',
        remaining_amount = 0
    where sale_id = v_sale.id
      and remaining_amount = original_amount;

    if not found then
      raise exception 'Debt sale has payments; use explicit debt adjustment workflow first';
    end if;
  end if;

  update public.sales
  set status = 'voided',
      corrected_by = v_actor_id,
      corrected_at = now(),
      correction_reason = v_reason
  where id = v_sale.id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before, after, reason)
  values (v_actor_id, 'void', 'sale', v_sale.id::text,
    jsonb_build_object('status', v_sale.status, 'total', v_sale.total, 'payment_method', v_sale.payment_method),
    jsonb_build_object('status', 'voided', 'operation', v_operation),
    v_reason);

  return jsonb_build_object('sale_id', v_sale.id, 'status', 'voided', 'operation', v_operation);
end;
$$;

create or replace function public.correct_or_void_expense(_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_expense_id uuid := (_payload ->> 'expense_id')::uuid;
  v_reason text := nullif(_payload ->> 'reason', '');
  v_expense public.expenses%rowtype;
  v_account_id bigint;
  v_orig_event_id uuid;
begin
  if v_actor_id is null then raise exception 'Authentication required'; end if;
  if not public.user_has_role(v_actor_id, 'owner') then raise exception 'Only owner can void expenses'; end if;
  if v_expense_id is null then raise exception 'expense_id is required'; end if;
  if v_reason is null then raise exception 'reason is required'; end if;

  select * into v_expense from public.expenses e where e.id = v_expense_id for update;
  if not found then raise exception 'Expense not found'; end if;
  if v_expense.status = 'voided' then raise exception 'Expense already voided'; end if;

  select la.id into v_account_id from public.ledger_accounts la
  where la.account_type = case when v_expense.payment_method = 'cash' then 'cash'::public.ledger_account_type else 'mpesa'::public.ledger_account_type end and la.active = true
  limit 1;

  insert into public.ledger_entries (account_id, direction, amount, source_table, source_id, created_by)
  values (v_account_id, 'in', v_expense.amount, 'expense_corrections', v_expense.id, v_actor_id);

  select fe.id into v_orig_event_id from public.financial_events fe
  where fe.source_table = 'expenses' and fe.source_id = v_expense.id and fe.direction = 'out'
  order by fe.created_at asc
  limit 1;

  perform public.record_financial_event('expense_reversal', 'expense', v_expense.id::text, 'expense_corrections', v_expense.id, 'in', v_expense.payment_method, v_expense.amount, v_reason,
    jsonb_build_object('description', v_expense.description), v_orig_event_id);

  update public.expenses
  set status = 'voided', corrected_by = v_actor_id, corrected_at = now(), correction_reason = v_reason
  where id = v_expense.id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before, after, reason)
  values (v_actor_id, 'void', 'expense', v_expense.id::text,
    jsonb_build_object('status', 'active', 'amount', v_expense.amount),
    jsonb_build_object('status', 'voided'),
    v_reason);

  return jsonb_build_object('expense_id', v_expense.id, 'status', 'voided');
end;
$$;

create or replace function public.correct_or_void_purchase(_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_purchase_id uuid := (_payload ->> 'purchase_id')::uuid;
  v_reason text := nullif(_payload ->> 'reason', '');
  v_purchase public.purchases%rowtype;
  v_account_id bigint;
  v_orig_event_id uuid;
begin
  if v_actor_id is null then raise exception 'Authentication required'; end if;
  if not public.user_has_role(v_actor_id, 'owner') then raise exception 'Only owner can void purchases'; end if;
  if v_purchase_id is null then raise exception 'purchase_id is required'; end if;
  if v_reason is null then raise exception 'reason is required'; end if;

  select * into v_purchase from public.purchases p where p.id = v_purchase_id for update;
  if not found then raise exception 'Purchase not found'; end if;
  if v_purchase.status = 'voided' then raise exception 'Purchase already voided'; end if;

  select la.id into v_account_id from public.ledger_accounts la
  where la.account_type = case when v_purchase.payment_method = 'cash' then 'cash'::public.ledger_account_type else 'mpesa'::public.ledger_account_type end and la.active = true
  limit 1;

  insert into public.ledger_entries (account_id, direction, amount, source_table, source_id, created_by)
  values (v_account_id, 'in', v_purchase.total_cost, 'purchase_corrections', v_purchase.id, v_actor_id);

  select fe.id into v_orig_event_id from public.financial_events fe
  where fe.source_table = 'purchases' and fe.source_id = v_purchase.id and fe.direction = 'out'
  order by fe.created_at asc
  limit 1;

  perform public.record_financial_event('purchase_reversal', 'purchase', v_purchase.id::text, 'purchase_corrections', v_purchase.id, 'in', v_purchase.payment_method, v_purchase.total_cost, v_reason,
    jsonb_build_object('item_name', v_purchase.item_name), v_orig_event_id);

  update public.purchases
  set status = 'voided', corrected_by = v_actor_id, corrected_at = now(), correction_reason = v_reason
  where id = v_purchase.id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before, after, reason)
  values (v_actor_id, 'void', 'purchase', v_purchase.id::text,
    jsonb_build_object('status', 'active', 'total_cost', v_purchase.total_cost),
    jsonb_build_object('status', 'voided'),
    v_reason);

  return jsonb_build_object('purchase_id', v_purchase.id, 'status', 'voided');
end;
$$;

create or replace function public.create_reconciliation_session(_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_type text := (_payload ->> 'recon_type');
  v_actual numeric(12,2) := (_payload ->> 'actual_balance')::numeric;
  v_note text := nullif(_payload ->> 'note', '');
  v_day date := coalesce((_payload ->> 'recon_date')::date, current_date);
  v_expected numeric(12,2);
  v_variance numeric(12,2);
  v_id uuid;
begin
  if v_actor_id is null then raise exception 'Authentication required'; end if;
  if not public.user_has_role(v_actor_id, 'owner') then raise exception 'Only owner can reconcile balances'; end if;
  if v_type not in ('cash', 'mpesa') then raise exception 'recon_type must be cash or mpesa'; end if;
  if v_actual is null then raise exception 'actual_balance is required'; end if;

  select coalesce(sum(case when le.direction = 'in' then le.amount else -le.amount end),0)
    into v_expected
  from public.ledger_entries le
  join public.ledger_accounts la on la.id = le.account_id
  where la.account_type = v_type::public.ledger_account_type
    and le.event_time <= (v_day::timestamptz + interval '23 hour 59 minute 59 second');

  v_variance := round(v_actual - v_expected, 2);

  insert into public.reconciliation_sessions (recon_type, recon_date, expected_balance, actual_balance, variance, note, actor_id)
  values (v_type, v_day, v_expected, v_actual, v_variance, v_note, v_actor_id)
  returning id into v_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after, reason)
  values (v_actor_id, 'create', 'reconciliation', v_id::text,
    jsonb_build_object('recon_type', v_type, 'expected_balance', v_expected, 'actual_balance', v_actual, 'variance', v_variance),
    v_note);

  return jsonb_build_object('id', v_id, 'recon_type', v_type, 'expected_balance', v_expected, 'actual_balance', v_actual, 'variance', v_variance);
end;
$$;

create or replace function public.write_off_debt(_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_debt_id uuid := (_payload ->> 'debt_id')::uuid;
  v_reason text := nullif(_payload ->> 'reason', '');
  v_debt public.debts%rowtype;
  v_id uuid;
begin
  if v_actor_id is null then raise exception 'Authentication required'; end if;
  if not public.user_has_role(v_actor_id, 'owner') then raise exception 'Only owner can write off debt'; end if;
  if v_debt_id is null then raise exception 'debt_id is required'; end if;
  if v_reason is null then raise exception 'reason is required'; end if;

  select * into v_debt from public.debts d where d.id = v_debt_id for update;
  if not found then raise exception 'Debt not found'; end if;
  if v_debt.remaining_amount <= 0 then raise exception 'Debt has no remaining balance'; end if;

  insert into public.debt_write_offs (debt_id, amount, reason, actor_id)
  values (v_debt.id, v_debt.remaining_amount, v_reason, v_actor_id)
  returning id into v_id;

  update public.debts
  set remaining_amount = 0,
      status = 'written_off'
  where id = v_debt.id;

  perform public.record_financial_event('debt_write_off', 'debt', v_debt.id::text, 'debt_write_offs', v_id, 'out', 'debt'::public.payment_method, v_debt.remaining_amount, v_reason,
    jsonb_build_object('original_amount', v_debt.original_amount));

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after, reason)
  values (v_actor_id, 'status_change', 'debt', v_debt.id::text, jsonb_build_object('status', 'written_off', 'amount', v_debt.remaining_amount), v_reason);

  return jsonb_build_object('debt_id', v_debt.id, 'write_off_id', v_id, 'status', 'written_off');
end;
$$;

create or replace function public.close_day(_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_close_date date := coalesce((_payload ->> 'close_date')::date, current_date);
  v_note text := nullif(_payload ->> 'note', '');
  v_sales numeric(12,2);
  v_expenses numeric(12,2);
  v_purchases numeric(12,2);
  v_cash numeric(12,2);
  v_mpesa numeric(12,2);
  v_debt numeric(12,2);
  v_snapshot jsonb;
  v_id uuid;
begin
  if v_actor_id is null then raise exception 'Authentication required'; end if;
  if not public.user_has_role(v_actor_id, 'owner') then raise exception 'Only owner can close day'; end if;

  if exists(select 1 from public.daily_closures dc where dc.close_date = v_close_date and dc.status = 'closed') then
    raise exception 'Day % is already closed', v_close_date;
  end if;

  select coalesce(sum(total), 0) into v_sales from public.sales where sold_at::date = v_close_date and status <> 'voided';
  select coalesce(sum(amount), 0) into v_expenses from public.expenses where expense_time::date = v_close_date and status <> 'voided';
  select coalesce(sum(total_cost), 0) into v_purchases from public.purchases where purchase_date = v_close_date and status <> 'voided';
  select coalesce(sum(remaining_amount), 0) into v_debt from public.debts where status <> 'paid';

  select coalesce(sum(case when le.direction = 'in' then le.amount else -le.amount end), 0)
    into v_cash
  from public.ledger_entries le
  join public.ledger_accounts la on la.id = le.account_id
  where la.account_type = 'cash' and le.event_time <= (v_close_date::timestamptz + interval '23 hour 59 minute 59 second');

  select coalesce(sum(case when le.direction = 'in' then le.amount else -le.amount end), 0)
    into v_mpesa
  from public.ledger_entries le
  join public.ledger_accounts la on la.id = le.account_id
  where la.account_type = 'mpesa' and le.event_time <= (v_close_date::timestamptz + interval '23 hour 59 minute 59 second');

  v_snapshot := jsonb_build_object(
    'close_date', v_close_date,
    'sales', v_sales,
    'expenses', v_expenses,
    'purchases', v_purchases,
    'cash_balance', v_cash,
    'mpesa_balance', v_mpesa,
    'outstanding_debt', v_debt,
    'net_position', round(v_sales - v_expenses - v_purchases, 2)
  );

  insert into public.daily_closures (close_date, closed_by, summary_snapshot, reconciliation_note)
  values (v_close_date, v_actor_id, v_snapshot, v_note)
  returning id into v_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after, reason)
  values (v_actor_id, 'approve', 'daily_closure', v_id::text, v_snapshot, v_note);

  return jsonb_build_object('id', v_id, 'close_date', v_close_date, 'snapshot', v_snapshot);
end;
$$;

-- Access control for new tables
alter table public.financial_events enable row level security;
alter table public.daily_closures enable row level security;
alter table public.reconciliation_sessions enable row level security;
alter table public.debt_write_offs enable row level security;

create policy "owner_select_financial_events" on public.financial_events
for select to authenticated using (public.current_user_has_role('owner'));

create policy "owner_select_daily_closures" on public.daily_closures
for select to authenticated using (public.current_user_has_role('owner'));

create policy "owner_select_reconciliation_sessions" on public.reconciliation_sessions
for select to authenticated using (public.current_user_has_role('owner'));

create policy "owner_select_debt_write_offs" on public.debt_write_offs
for select to authenticated using (public.current_user_has_role('owner'));

revoke all on function public.correct_or_void_sale(jsonb) from public;
revoke all on function public.correct_or_void_expense(jsonb) from public;
revoke all on function public.correct_or_void_purchase(jsonb) from public;
revoke all on function public.create_reconciliation_session(jsonb) from public;
revoke all on function public.write_off_debt(jsonb) from public;
revoke all on function public.close_day(jsonb) from public;

grant execute on function public.correct_or_void_sale(jsonb) to authenticated;
grant execute on function public.correct_or_void_expense(jsonb) to authenticated;
grant execute on function public.correct_or_void_purchase(jsonb) to authenticated;
grant execute on function public.create_reconciliation_session(jsonb) to authenticated;
grant execute on function public.write_off_debt(jsonb) to authenticated;
grant execute on function public.close_day(jsonb) to authenticated;
