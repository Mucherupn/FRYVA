-- Phase 2 transactional RPC functions for sales + debt collection

create sequence if not exists public.sale_number_seq;

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
begin
  if v_actor_id is null then
    raise exception 'Authentication required';
  end if;

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

    select mi.selling_price
      into v_unit_price
    from public.menu_items mi
    where mi.id = v_menu_item_id
      and mi.active = true;

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

    select mi.selling_price
      into v_unit_price
    from public.menu_items mi
    where mi.id = v_menu_item_id;

    v_line_total := round(v_unit_price * v_qty, 2);

    insert into public.sale_items (sale_id, menu_item_id, quantity, unit_price, line_total)
    values (v_sale_id, v_menu_item_id, v_qty, v_unit_price, v_line_total);
  end loop;

  if v_payment_method in ('cash', 'mpesa') then
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
    values (v_account_id, 'in', v_subtotal, 'sales', v_sale_id, v_actor_id);
  else
    v_debtor_name := nullif(_payload ->> 'debtor_name', '');
    if v_debtor_name is null then
      raise exception 'debtor_name is required for debt sale';
    end if;

    v_debtor_phone := nullif(_payload ->> 'debtor_phone', '');
    v_debt_note := nullif(_payload ->> 'debt_note', '');

    insert into public.debtors (full_name, phone, notes)
    values (v_debtor_name, v_debtor_phone, v_debt_note)
    returning id into v_debtor_id;

    insert into public.debts (sale_id, debtor_id, assigned_waiter_id, original_amount, remaining_amount, status)
    values (v_sale_id, v_debtor_id, v_sold_by, v_subtotal, v_subtotal, 'unpaid')
    returning id into v_debt_id;
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after, reason)
  values (
    v_actor_id,
    'create',
    'sale',
    v_sale_id::text,
    jsonb_build_object(
      'sale_id', v_sale_id,
      'sale_number', v_sale_number,
      'payment_method', v_payment_method,
      'total', v_subtotal,
      'debt_id', v_debt_id
    ),
    v_note
  );

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'sale_number', v_sale_number,
    'total', v_subtotal,
    'payment_method', v_payment_method,
    'debt_id', v_debt_id
  );
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
  if v_actor_id is null then
    raise exception 'Authentication required';
  end if;

  v_role_waiter := public.user_has_role(v_actor_id, 'waiter');
  v_role_owner := public.user_has_role(v_actor_id, 'owner');

  if not (v_role_waiter or v_role_owner) then
    raise exception 'Only owner/waiter can record debt payments';
  end if;

  if v_debt_id is null then
    raise exception 'debt_id is required';
  end if;

  if v_payment_method not in ('cash', 'mpesa') then
    raise exception 'payment_method must be cash or mpesa';
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception 'amount must be > 0';
  end if;

  select *
    into v_debt
  from public.debts d
  where d.id = v_debt_id
  for update;

  if not found then
    raise exception 'Debt not found';
  end if;

  if v_role_waiter and v_debt.assigned_waiter_id <> v_actor_id then
    raise exception 'Waiter can only record payment for assigned debts';
  end if;

  if v_amount > v_debt.remaining_amount then
    raise exception 'Payment amount exceeds remaining debt';
  end if;

  insert into public.debt_payments (debt_id, amount, payment_method, received_by, note)
  values (v_debt_id, v_amount, v_payment_method, v_actor_id, v_note)
  returning id into v_payment_id;

  v_remaining := round(v_debt.remaining_amount - v_amount, 2);
  v_status := case
    when v_remaining = 0 then 'paid'::public.debt_status
    when v_remaining < v_debt.original_amount then 'partial'::public.debt_status
    else 'unpaid'::public.debt_status
  end;

  update public.debts
  set remaining_amount = v_remaining,
      status = v_status
  where id = v_debt_id;

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
  values (v_account_id, 'in', v_amount, 'debt_payments', v_payment_id, v_actor_id);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after, reason)
  values (
    v_actor_id,
    'payment',
    'debt',
    v_debt_id::text,
    jsonb_build_object(
      'debt_id', v_debt_id,
      'payment_id', v_payment_id,
      'amount', v_amount,
      'payment_method', v_payment_method,
      'remaining_amount', v_remaining,
      'status', v_status
    ),
    v_note
  );

  return jsonb_build_object(
    'debt_id', v_debt_id,
    'payment_id', v_payment_id,
    'remaining_amount', v_remaining,
    'status', v_status
  );
end;
$$;

revoke all on function public.finalize_sale(jsonb) from public;
revoke all on function public.record_debt_payment(jsonb) from public;
grant execute on function public.finalize_sale(jsonb) to authenticated;
grant execute on function public.record_debt_payment(jsonb) to authenticated;
