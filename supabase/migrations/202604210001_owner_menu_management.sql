-- Owner-driven menu management hardening

alter table public.menu_items
  add column if not exists available boolean not null default true,
  add column if not exists sort_order integer not null default 0,
  add column if not exists item_type text not null default 'kitchen_prepared' check (item_type in ('kitchen_prepared', 'resale')),
  add column if not exists updated_at timestamptz not null default now();

alter table public.menu_items
  alter column category_id drop not null;

create index if not exists idx_menu_items_pos_visibility
  on public.menu_items (active, available, sort_order, name);

drop trigger if exists trg_menu_items_set_updated_at on public.menu_items;
create trigger trg_menu_items_set_updated_at
before update on public.menu_items
for each row execute function public.set_updated_at();

alter table public.sale_items
  add column if not exists menu_item_name text;

update public.sale_items si
set menu_item_name = mi.name
from public.menu_items mi
where si.menu_item_id = mi.id
  and (si.menu_item_name is null or btrim(si.menu_item_name) = '');

alter table public.sale_items
  alter column menu_item_name set default 'Item';

update public.sale_items
set menu_item_name = 'Item'
where menu_item_name is null or btrim(menu_item_name) = '';

alter table public.sale_items
  alter column menu_item_name set not null;

-- Ensure there is always an uncategorized option for owner workflow convenience.
insert into public.menu_categories (name, active)
values ('Uncategorized', true)
on conflict (name) do update
set active = true;

-- Replace generated defaults with owner starter menu without breaking historical references.
update public.menu_items
set active = false,
    available = false,
    updated_at = now()
where name in ('Mandazi + Chai', 'Chicken Pilau', 'Soda 300ml');

with starter_items(name, category_name, selling_price, stock_tracked, item_type, sort_order) as (
  values
    ('Tea', 'Drinks', 30.00::numeric, false, 'kitchen_prepared', 10),
    ('Coffee', 'Drinks', 30.00::numeric, false, 'kitchen_prepared', 20),
    ('Chapati', 'Main Meals', 20.00::numeric, true, 'kitchen_prepared', 30),
    ('Pilau', 'Main Meals', 120.00::numeric, true, 'kitchen_prepared', 40),
    ('Chips', 'Main Meals', 100.00::numeric, true, 'kitchen_prepared', 50),
    ('Chips Kubwa', 'Main Meals', 150.00::numeric, true, 'kitchen_prepared', 60),
    ('Sausage', 'Main Meals', 50.00::numeric, true, 'resale', 70),
    ('Smokie', 'Main Meals', 30.00::numeric, true, 'resale', 80),
    ('Ugali', 'Main Meals', 50.00::numeric, true, 'kitchen_prepared', 90),
    ('White Rice', 'Main Meals', 60.00::numeric, true, 'kitchen_prepared', 100),
    ('Chicken Piece', 'Main Meals', 100.00::numeric, true, 'kitchen_prepared', 110),
    ('Chicken 1/4', 'Main Meals', 180.00::numeric, true, 'kitchen_prepared', 120),
    ('Chicken Stew', 'Main Meals', 100.00::numeric, true, 'kitchen_prepared', 130),
    ('Ndengu Stew', 'Main Meals', 60.00::numeric, true, 'kitchen_prepared', 140),
    ('Beans Stew', 'Main Meals', 60.00::numeric, true, 'kitchen_prepared', 150),
    ('Soda Small', 'Drinks', 60.00::numeric, true, 'resale', 160),
    ('Predator', 'Drinks', 70.00::numeric, true, 'resale', 170),
    ('Soda Kubwa', 'Drinks', 80.00::numeric, true, 'resale', 180),
    ('Water', 'Drinks', 30.00::numeric, true, 'resale', 190),
    ('Milk', 'Drinks', 60.00::numeric, true, 'resale', 200),
    ('Tea Special', 'Drinks', 60.00::numeric, false, 'kitchen_prepared', 210)
)
insert into public.menu_items (name, category_id, selling_price, cost_price, stock_tracked, active, available, kitchen_item, item_type, sort_order)
select
  s.name,
  c.id,
  s.selling_price,
  null,
  s.stock_tracked,
  true,
  true,
  s.item_type = 'kitchen_prepared',
  s.item_type,
  s.sort_order
from starter_items s
join public.menu_categories c on c.name = s.category_name
on conflict (name, category_id) do update
set selling_price = excluded.selling_price,
    stock_tracked = excluded.stock_tracked,
    active = true,
    available = true,
    kitchen_item = excluded.kitchen_item,
    item_type = excluded.item_type,
    sort_order = excluded.sort_order,
    updated_at = now();

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
  v_menu_item_name text;
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

    select mi.name, mi.selling_price into v_menu_item_name, v_unit_price
    from public.menu_items mi
    where mi.id = v_menu_item_id and mi.active = true and mi.available = true;

    if v_unit_price is null then
      raise exception 'Menu item % is inactive/unavailable/missing', v_menu_item_id;
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

    select mi.name, mi.selling_price into v_menu_item_name, v_unit_price
    from public.menu_items mi
    where mi.id = v_menu_item_id;

    v_line_total := round(v_unit_price * v_qty, 2);
    insert into public.sale_items (sale_id, menu_item_id, menu_item_name, quantity, unit_price, line_total)
    values (v_sale_id, v_menu_item_id, coalesce(v_menu_item_name, 'Item'), v_qty, v_unit_price, v_line_total);
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
