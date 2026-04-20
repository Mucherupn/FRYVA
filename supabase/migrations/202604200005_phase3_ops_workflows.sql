-- Phase 3 operational workflows: chef stock/production, purchases, expenses, and owner operational visibility

alter table public.opening_stock_entries
  add column if not exists updated_at timestamptz not null default now();

alter table public.stock_production_entries
  add column if not exists produced_at timestamptz not null default now();

create table if not exists public.opening_stock_entry_revisions (
  id uuid primary key default gen_random_uuid(),
  opening_stock_entry_id uuid not null references public.opening_stock_entries(id) on delete cascade,
  entry_date date not null,
  menu_item_id bigint not null references public.menu_items(id),
  previous_qty numeric(12,2) not null,
  new_qty numeric(12,2) not null,
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now(),
  note text
);

create unique index if not exists uq_opening_stock_entries_day_item
  on public.opening_stock_entries(entry_date, menu_item_id);

create index if not exists idx_opening_stock_entry_revisions_entry
  on public.opening_stock_entry_revisions(opening_stock_entry_id, changed_at desc);

create index if not exists idx_stock_production_entries_entry_date
  on public.stock_production_entries(entry_date, menu_item_id);

create index if not exists idx_purchases_purchase_date
  on public.purchases(purchase_date, category);

create index if not exists idx_expenses_expense_time
  on public.expenses(expense_time);

alter table public.opening_stock_entry_revisions enable row level security;

create policy "opening_stock_entry_revisions_select_chef_or_owner" on public.opening_stock_entry_revisions
for select to authenticated
using (public.current_user_has_role('chef') or public.current_user_has_role('owner'));

create policy "opening_stock_entry_revisions_owner_insert" on public.opening_stock_entry_revisions
for insert to authenticated
with check (public.current_user_has_role('owner'));

create or replace function public.record_opening_stock(_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_is_chef boolean;
  v_is_owner boolean;
  v_entry_date date := coalesce((_payload ->> 'entry_date')::date, current_date);
  v_note text := nullif(_payload ->> 'note', '');
  v_items jsonb := _payload -> 'items';
  v_item jsonb;
  v_menu_item_id bigint;
  v_qty numeric(12,2);
  v_existing public.opening_stock_entries%rowtype;
  v_written_count int := 0;
begin
  if v_actor_id is null then
    raise exception 'Authentication required';
  end if;

  v_is_chef := public.user_has_role(v_actor_id, 'chef');
  v_is_owner := public.user_has_role(v_actor_id, 'owner');

  if not (v_is_chef or v_is_owner) then
    raise exception 'Only chef/owner can record opening stock';
  end if;

  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'items array is required';
  end if;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_menu_item_id := (v_item ->> 'menu_item_id')::bigint;
    v_qty := (v_item ->> 'qty')::numeric;

    if v_menu_item_id is null or v_qty is null or v_qty < 0 then
      raise exception 'Invalid opening stock payload item';
    end if;

    if not exists (
      select 1
      from public.menu_items mi
      where mi.id = v_menu_item_id
        and mi.active = true
        and (mi.kitchen_item = true or mi.stock_tracked = true)
    ) then
      raise exception 'Menu item % is not stock-entry eligible', v_menu_item_id;
    end if;

    select *
      into v_existing
    from public.opening_stock_entries ose
    where ose.entry_date = v_entry_date
      and ose.menu_item_id = v_menu_item_id
    for update;

    if found then
      insert into public.opening_stock_entry_revisions (
        opening_stock_entry_id,
        entry_date,
        menu_item_id,
        previous_qty,
        new_qty,
        changed_by,
        note
      )
      values (
        v_existing.id,
        v_entry_date,
        v_menu_item_id,
        v_existing.qty,
        v_qty,
        v_actor_id,
        v_note
      );

      update public.opening_stock_entries
      set qty = v_qty,
          entered_by = v_actor_id,
          note = coalesce(v_note, note),
          updated_at = now()
      where id = v_existing.id;
    else
      insert into public.opening_stock_entries (entry_date, menu_item_id, qty, entered_by, note)
      values (v_entry_date, v_menu_item_id, v_qty, v_actor_id, v_note);
    end if;

    v_written_count := v_written_count + 1;
  end loop;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after, reason)
  values (
    v_actor_id,
    'update',
    'opening_stock_bulk',
    v_entry_date::text,
    jsonb_build_object('entry_date', v_entry_date, 'rows_written', v_written_count),
    v_note
  );

  return jsonb_build_object('entry_date', v_entry_date, 'rows_written', v_written_count);
end;
$$;

create or replace function public.record_production_entry(_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_is_chef boolean;
  v_is_owner boolean;
  v_entry_date date := coalesce((_payload ->> 'entry_date')::date, current_date);
  v_menu_item_id bigint := (_payload ->> 'menu_item_id')::bigint;
  v_qty numeric(12,2) := (_payload ->> 'qty')::numeric;
  v_note text := nullif(_payload ->> 'note', '');
  v_produced_at timestamptz := coalesce((_payload ->> 'produced_at')::timestamptz, now());
  v_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Authentication required';
  end if;

  v_is_chef := public.user_has_role(v_actor_id, 'chef');
  v_is_owner := public.user_has_role(v_actor_id, 'owner');

  if not (v_is_chef or v_is_owner) then
    raise exception 'Only chef/owner can record production';
  end if;

  if v_menu_item_id is null or v_qty is null or v_qty <= 0 then
    raise exception 'menu_item_id and qty > 0 are required';
  end if;

  if not exists (
    select 1
    from public.menu_items mi
    where mi.id = v_menu_item_id
      and mi.active = true
      and (mi.kitchen_item = true or mi.stock_tracked = true)
  ) then
    raise exception 'Menu item % is not production eligible', v_menu_item_id;
  end if;

  insert into public.stock_production_entries (entry_date, menu_item_id, qty, entered_by, note, produced_at)
  values (v_entry_date, v_menu_item_id, v_qty, v_actor_id, v_note, v_produced_at)
  returning id into v_id;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after, reason)
  values (
    v_actor_id,
    'create',
    'production_entry',
    v_id::text,
    jsonb_build_object('entry_date', v_entry_date, 'menu_item_id', v_menu_item_id, 'qty', v_qty),
    v_note
  );

  return jsonb_build_object('id', v_id, 'entry_date', v_entry_date, 'qty', v_qty);
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
  if v_actor_id is null then
    raise exception 'Authentication required';
  end if;

  v_is_chef := public.user_has_role(v_actor_id, 'chef');
  v_is_owner := public.user_has_role(v_actor_id, 'owner');

  if not (v_is_chef or v_is_owner) then
    raise exception 'Only chef/owner can record expenses';
  end if;

  if v_is_chef then
    v_source := 'chef';
  end if;

  if v_description is null then
    raise exception 'description is required';
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception 'amount must be > 0';
  end if;

  if v_payment_method not in ('cash', 'mpesa') then
    raise exception 'payment_method must be cash or mpesa';
  end if;

  v_expense_time := v_expense_date::timestamptz + (now()::time);

  insert into public.expenses (expense_time, description, category, amount, payment_method, note, entered_by, source)
  values (v_expense_time, v_description, v_category, v_amount, v_payment_method, v_note, v_actor_id, v_source)
  returning id into v_id;

  select la.id
    into v_account_id
  from public.ledger_accounts la
  where la.account_type = case when v_payment_method = 'cash' then 'cash'::public.ledger_account_type else 'mpesa'::public.ledger_account_type end
    and la.active = true
  limit 1;

  if v_account_id is null then
    raise exception 'Missing active % ledger account', v_payment_method;
  end if;

  insert into public.ledger_entries (account_id, direction, amount, source_table, source_id, created_by)
  values (v_account_id, 'out', v_amount, 'expenses', v_id, v_actor_id);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after, reason)
  values (
    v_actor_id,
    'create',
    'expense',
    v_id::text,
    jsonb_build_object('amount', v_amount, 'payment_method', v_payment_method, 'source', v_source),
    v_note
  );

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
  v_id uuid;
  v_account_id bigint;
  v_expected_total numeric(12,2);
begin
  if v_actor_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.user_has_role(v_actor_id, 'owner') then
    raise exception 'Only owner can record purchases';
  end if;

  if v_item_name is null or v_unit is null then
    raise exception 'item_name and unit are required';
  end if;

  if v_qty is null or v_qty <= 0 then
    raise exception 'qty must be > 0';
  end if;

  if v_unit_cost is null or v_unit_cost < 0 then
    raise exception 'unit_cost must be >= 0';
  end if;

  if v_total_cost is null or v_total_cost <= 0 then
    raise exception 'total_cost must be > 0';
  end if;

  if v_payment_method not in ('cash', 'mpesa') then
    raise exception 'payment_method must be cash or mpesa';
  end if;

  v_expected_total := round(v_qty * v_unit_cost, 2);
  if abs(v_expected_total - v_total_cost) > 0.02 then
    raise exception 'total_cost does not match qty x unit_cost';
  end if;

  insert into public.purchases (purchase_date, item_name, category, qty, unit, unit_cost, total_cost, payment_method, supplier, note, entered_by)
  values (v_purchase_date, v_item_name, v_category, v_qty, v_unit, v_unit_cost, v_total_cost, v_payment_method, v_supplier, v_note, v_actor_id)
  returning id into v_id;

  select la.id
    into v_account_id
  from public.ledger_accounts la
  where la.account_type = case when v_payment_method = 'cash' then 'cash'::public.ledger_account_type else 'mpesa'::public.ledger_account_type end
    and la.active = true
  limit 1;

  if v_account_id is null then
    raise exception 'Missing active % ledger account', v_payment_method;
  end if;

  insert into public.ledger_entries (account_id, direction, amount, source_table, source_id, created_by)
  values (v_account_id, 'out', v_total_cost, 'purchases', v_id, v_actor_id);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after, reason)
  values (
    v_actor_id,
    'create',
    'purchase',
    v_id::text,
    jsonb_build_object('item_name', v_item_name, 'qty', v_qty, 'total_cost', v_total_cost, 'payment_method', v_payment_method),
    v_note
  );

  return jsonb_build_object('id', v_id, 'total_cost', v_total_cost, 'payment_method', v_payment_method);
end;
$$;
