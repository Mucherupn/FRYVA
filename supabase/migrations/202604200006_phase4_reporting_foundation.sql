-- Phase 4 reporting foundation: strengthen purchase-to-item linkage and reporting indexes

alter table public.purchases
  add column if not exists menu_item_id bigint references public.menu_items(id);

create index if not exists idx_purchases_menu_item_date
  on public.purchases(menu_item_id, purchase_date desc);

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

  if v_menu_item_id is not null and not exists (select 1 from public.menu_items mi where mi.id = v_menu_item_id) then
    raise exception 'menu_item_id % not found', v_menu_item_id;
  end if;

  v_expected_total := round(v_qty * v_unit_cost, 2);
  if abs(v_expected_total - v_total_cost) > 0.02 then
    raise exception 'total_cost does not match qty x unit_cost';
  end if;

  insert into public.purchases (purchase_date, item_name, menu_item_id, category, qty, unit, unit_cost, total_cost, payment_method, supplier, note, entered_by)
  values (v_purchase_date, v_item_name, v_menu_item_id, v_category, v_qty, v_unit, v_unit_cost, v_total_cost, v_payment_method, v_supplier, v_note, v_actor_id)
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
    jsonb_build_object('total_cost', v_total_cost, 'payment_method', v_payment_method, 'menu_item_id', v_menu_item_id),
    v_note
  );

  return jsonb_build_object('id', v_id, 'total_cost', v_total_cost, 'payment_method', v_payment_method, 'menu_item_id', v_menu_item_id);
end;
$$;

update public.purchases p
set menu_item_id = mi.id
from public.menu_items mi
where p.menu_item_id is null
  and lower(trim(mi.name)) = lower(trim(p.item_name));
