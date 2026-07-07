-- Restaurant operations controls: staff meals, closing stock, variance reviews, reset RPC
alter type public.payment_method add value if not exists 'staff';

create table if not exists public.staff_meal_records (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null unique references public.sales(id) on delete cascade,
  staff_name text not null,
  staff_option text not null check (staff_option in ('Amo','Tallia','Eliza','Kanjaa','Others')),
  note text,
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  business_date date not null default ((now() at time zone 'Africa/Nairobi')::date),
  total_value numeric(12,2) not null check (total_value >= 0)
);

create table if not exists public.closing_stock_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  menu_item_id bigint not null references public.menu_items(id),
  qty numeric(12,2) not null check (qty >= 0),
  entered_by uuid not null references auth.users(id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entry_date, menu_item_id)
);

create table if not exists public.stock_variance_reviews (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  menu_item_id bigint not null references public.menu_items(id),
  status text not null default 'unresolved' check (status in ('unresolved','resolved')),
  review_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_date, menu_item_id)
);

alter table public.staff_meal_records enable row level security;
alter table public.closing_stock_entries enable row level security;
alter table public.stock_variance_reviews enable row level security;

drop policy if exists "staff_meal_records_select_owner" on public.staff_meal_records;
create policy "staff_meal_records_select_owner" on public.staff_meal_records for select to authenticated using (public.current_user_has_role('owner'));

drop policy if exists "closing_stock_entries_select_chef_or_owner" on public.closing_stock_entries;
create policy "closing_stock_entries_select_chef_or_owner" on public.closing_stock_entries for select to authenticated using (public.current_user_has_role('chef') or public.current_user_has_role('owner'));
drop policy if exists "closing_stock_entries_insert_chef_or_owner" on public.closing_stock_entries;
create policy "closing_stock_entries_insert_chef_or_owner" on public.closing_stock_entries for insert to authenticated with check ((public.current_user_has_role('chef') or public.current_user_has_role('owner')) and entered_by = auth.uid());
drop policy if exists "closing_stock_entries_update_chef_or_owner" on public.closing_stock_entries;
create policy "closing_stock_entries_update_chef_or_owner" on public.closing_stock_entries for update to authenticated using (public.current_user_has_role('chef') or public.current_user_has_role('owner')) with check ((public.current_user_has_role('chef') or public.current_user_has_role('owner')) and entered_by = auth.uid());

drop policy if exists "stock_variance_reviews_owner_all" on public.stock_variance_reviews;
create policy "stock_variance_reviews_owner_all" on public.stock_variance_reviews for all to authenticated using (public.current_user_has_role('owner')) with check (public.current_user_has_role('owner'));

create or replace function public.record_closing_stock(_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor_id uuid := auth.uid(); v_entry_date date := coalesce((_payload->>'entry_date')::date, (now() at time zone 'Africa/Nairobi')::date);
  v_note text := nullif(_payload->>'note',''); v_items jsonb := _payload->'items'; v_item jsonb; v_menu_item_id bigint; v_qty numeric(12,2); v_count int := 0;
begin
  if v_actor_id is null then raise exception 'Authentication required'; end if;
  if not (public.user_has_role(v_actor_id,'chef') or public.user_has_role(v_actor_id,'owner')) then raise exception 'Only chef/owner can record closing stock'; end if;
  if v_items is null or jsonb_typeof(v_items) <> 'array' then raise exception 'items array is required'; end if;
  perform public.assert_day_not_closed(v_entry_date, true);
  for v_item in select * from jsonb_array_elements(v_items) loop
    v_menu_item_id := (v_item->>'menu_item_id')::bigint; v_qty := (v_item->>'qty')::numeric;
    if v_menu_item_id is null or v_qty is null or v_qty < 0 then raise exception 'Invalid closing stock item'; end if;
    if not exists (select 1 from public.menu_items where id = v_menu_item_id and active = true and stock_tracked = true) then raise exception 'Menu item % is not stock tracked', v_menu_item_id; end if;
    insert into public.closing_stock_entries(entry_date, menu_item_id, qty, entered_by, note)
    values(v_entry_date, v_menu_item_id, v_qty, v_actor_id, v_note)
    on conflict(entry_date, menu_item_id) do update set qty = excluded.qty, note = excluded.note, entered_by = excluded.entered_by, updated_at = now();
    v_count := v_count + 1;
  end loop;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, after, reason) values(v_actor_id,'update','closing_stock',v_entry_date::text,jsonb_build_object('count',v_count),v_note);
  return jsonb_build_object('entry_date', v_entry_date, 'count', v_count);
end; $$;

create or replace function public.review_stock_variance(_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor_id uuid := auth.uid(); v_date date := (_payload->>'business_date')::date; v_item bigint := (_payload->>'menu_item_id')::bigint; v_status text := coalesce(_payload->>'status','resolved'); v_note text := nullif(_payload->>'review_note',''); v_id uuid;
begin
  if v_actor_id is null then raise exception 'Authentication required'; end if;
  if not public.user_has_role(v_actor_id,'owner') then raise exception 'Only owner can review stock variances'; end if;
  if v_date is null or v_item is null then raise exception 'business_date and menu_item_id are required'; end if;
  insert into public.stock_variance_reviews(business_date, menu_item_id, status, review_note, reviewed_by, reviewed_at)
  values(v_date, v_item, v_status, v_note, v_actor_id, now())
  on conflict(business_date, menu_item_id) do update set status=excluded.status, review_note=excluded.review_note, reviewed_by=excluded.reviewed_by, reviewed_at=excluded.reviewed_at, updated_at=now()
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'status', v_status);
end; $$;

create or replace function public.finalize_sale(_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor_id uuid := auth.uid(); v_role_waiter boolean; v_role_owner boolean; v_sold_by uuid; v_payment_method public.payment_method; v_note text; v_items jsonb; v_item jsonb; v_menu_item_id bigint; v_qty numeric(12,2); v_unit_price numeric(12,2); v_line_total numeric(12,2); v_subtotal numeric(12,2) := 0; v_sale_id uuid; v_sale_number text; v_debtor_name text; v_debtor_phone text; v_debt_note text; v_debtor_id uuid; v_debt_id uuid; v_account_id bigint; v_sale_day date := (now() at time zone 'Africa/Nairobi')::date; v_menu_item_name text; v_staff_option text; v_staff_name text; v_staff_note text;
begin
  if v_actor_id is null then raise exception 'Authentication required'; end if;
  perform public.assert_day_not_closed(v_sale_day, true);
  v_role_waiter := public.user_has_role(v_actor_id, 'waiter'); v_role_owner := public.user_has_role(v_actor_id, 'owner');
  if not (v_role_waiter or v_role_owner) then raise exception 'Only owner/waiter can finalize sales'; end if;
  v_sold_by := coalesce((_payload ->> 'sold_by')::uuid, v_actor_id); if v_role_waiter and v_sold_by <> v_actor_id then raise exception 'Waiter can only create sale as self'; end if;
  v_payment_method := (_payload ->> 'payment_method')::public.payment_method; if v_payment_method is null then raise exception 'payment_method is required'; end if;
  v_note := nullif(_payload ->> 'note', ''); v_items := _payload -> 'items'; if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then raise exception 'At least one sale item is required'; end if;
  if v_payment_method = 'staff' then
    v_staff_option := nullif(_payload->>'staff_option',''); v_staff_note := nullif(_payload->>'staff_note','');
    if v_staff_option is null then raise exception 'staff_option is required for staff meals'; end if;
    v_staff_name := case when v_staff_option = 'Others' then coalesce(nullif(_payload->>'staff_name',''), 'Others') else v_staff_option end;
  end if;
  for v_item in select * from jsonb_array_elements(v_items) loop
    v_menu_item_id := (v_item ->> 'menu_item_id')::bigint; v_qty := (v_item ->> 'quantity')::numeric; if v_menu_item_id is null or v_qty is null or v_qty <= 0 then raise exception 'Invalid sale item payload'; end if;
    select mi.name, mi.selling_price into v_menu_item_name, v_unit_price from public.menu_items mi where mi.id = v_menu_item_id and mi.active = true and mi.available = true;
    if v_unit_price is null then raise exception 'Menu item % is inactive/unavailable/missing', v_menu_item_id; end if;
    v_subtotal := v_subtotal + round(v_unit_price * v_qty, 2);
  end loop;
  v_subtotal := round(v_subtotal, 2); v_sale_number := concat('SAL-', to_char(now(), 'YYYYMMDD'), '-', lpad(nextval('public.sale_number_seq')::text, 6, '0'));
  insert into public.sales (sale_number, sold_by, subtotal, total, payment_method, note) values (v_sale_number, v_sold_by, v_subtotal, v_subtotal, v_payment_method, v_note) returning id into v_sale_id;
  for v_item in select * from jsonb_array_elements(v_items) loop
    v_menu_item_id := (v_item ->> 'menu_item_id')::bigint; v_qty := (v_item ->> 'quantity')::numeric; select mi.name, mi.selling_price into v_menu_item_name, v_unit_price from public.menu_items mi where mi.id = v_menu_item_id; v_line_total := round(v_unit_price * v_qty, 2);
    insert into public.sale_items (sale_id, menu_item_id, menu_item_name, quantity, unit_price, line_total) values (v_sale_id, v_menu_item_id, coalesce(v_menu_item_name, 'Item'), v_qty, v_unit_price, v_line_total);
  end loop;
  if v_payment_method in ('cash', 'mpesa') then
    select la.id into v_account_id from public.ledger_accounts la where la.account_type = case when v_payment_method = 'cash' then 'cash'::public.ledger_account_type else 'mpesa'::public.ledger_account_type end and la.active = true limit 1;
    if v_account_id is null then raise exception 'Missing active % ledger account', v_payment_method; end if;
    insert into public.ledger_entries (account_id, direction, amount, source_table, source_id, created_by) values (v_account_id, 'in', v_subtotal, 'sales', v_sale_id, v_actor_id);
    perform public.record_financial_event('sale_posted', 'sale', v_sale_id::text, 'sales', v_sale_id, 'in', v_payment_method, v_subtotal, v_note, jsonb_build_object('sale_number', v_sale_number));
  elsif v_payment_method = 'debt' then
    v_debtor_name := nullif(_payload ->> 'debtor_name', ''); if v_debtor_name is null then raise exception 'debtor_name is required for debt sale'; end if;
    v_debtor_phone := nullif(_payload ->> 'debtor_phone', ''); v_debt_note := nullif(_payload ->> 'debt_note', '');
    insert into public.debtors (full_name, phone, notes) values (v_debtor_name, v_debtor_phone, v_debt_note) returning id into v_debtor_id;
    insert into public.debts (sale_id, debtor_id, assigned_waiter_id, original_amount, remaining_amount, status) values (v_sale_id, v_debtor_id, v_sold_by, v_subtotal, v_subtotal, 'unpaid') returning id into v_debt_id;
    perform public.record_financial_event('sale_debt_created', 'sale', v_sale_id::text, 'sales', v_sale_id, 'in', 'debt'::public.payment_method, v_subtotal, v_note, jsonb_build_object('debt_id', v_debt_id));
  else
    insert into public.staff_meal_records(sale_id, staff_name, staff_option, note, recorded_by, business_date, total_value) values(v_sale_id, v_staff_name, v_staff_option, v_staff_note, v_actor_id, v_sale_day, v_subtotal);
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after, reason) values (v_actor_id, 'create', 'sale', v_sale_id::text, jsonb_build_object('sale_id', v_sale_id, 'sale_number', v_sale_number, 'payment_method', v_payment_method, 'total', v_subtotal, 'debt_id', v_debt_id, 'staff_name', v_staff_name), v_note);
  return jsonb_build_object('sale_id', v_sale_id, 'sale_number', v_sale_number, 'total', v_subtotal, 'payment_method', v_payment_method, 'debt_id', v_debt_id);
end; $$;

create or replace function public.reset_operational_data(_confirmation text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then raise exception 'Authentication required'; end if;
  if not public.user_has_role(v_actor_id,'owner') then raise exception 'Only owner can reset operational data'; end if;
  if _confirmation <> 'CLEAR FRYVA DATA' then raise exception 'Typed confirmation did not match'; end if;
  truncate table public.stock_variance_reviews, public.staff_meal_records, public.debt_payments, public.debts, public.debtors, public.sale_items, public.sales, public.expenses, public.purchases, public.opening_stock_entries, public.opening_stock_entry_revisions, public.stock_production_entries, public.closing_stock_entries, public.ledger_entries, public.financial_events, public.audit_logs restart identity cascade;
  return jsonb_build_object('ok', true, 'reset_at', now());
end; $$;

grant execute on function public.record_closing_stock(jsonb) to authenticated;
grant execute on function public.review_stock_variance(jsonb) to authenticated;
grant execute on function public.reset_operational_data(text) to authenticated;
