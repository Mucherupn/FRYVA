-- Chef Sales of the Day diagnostic.
-- Run this in Supabase SQL Editor as an owner/service-role session to verify
-- today's sales data path with Africa/Nairobi day boundaries.

with kenya_bounds as (
  select
    (now() at time zone 'Africa/Nairobi')::date as kenya_date,
    ((now() at time zone 'Africa/Nairobi')::date::timestamp at time zone 'Africa/Nairobi') as day_start_utc,
    (((now() at time zone 'Africa/Nairobi')::date + 1)::timestamp at time zone 'Africa/Nairobi') as day_end_utc
),
column_check as (
  select
    c.table_name,
    c.column_name,
    c.data_type,
    c.udt_name,
    c.is_nullable
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name in ('sales', 'sale_items', 'menu_items')
    and c.column_name in ('id', 'sale_id', 'menu_item_id', 'name', 'menu_item_name', 'quantity', 'sold_at', 'created_at', 'status', 'payment_method')
),
today_sales as (
  select s.id, s.sale_number, s.sold_at, s.status, s.payment_method
  from public.sales s
  cross join kenya_bounds kb
  where s.sold_at >= kb.day_start_utc
    and s.sold_at < kb.day_end_utc
),
today_sale_items as (
  select si.sale_id, si.menu_item_id, si.quantity, si.menu_item_name
  from public.sale_items si
  join today_sales ts on ts.id = si.sale_id
),
linked_menu_items as (
  select tsi.sale_id, tsi.menu_item_id, mi.name as menu_item_name, tsi.quantity
  from today_sale_items tsi
  join public.menu_items mi on mi.id = tsi.menu_item_id
),
chef_aggregate as (
  select
    mi.name::text as item_name,
    sum(si.quantity)::numeric as quantity_sold
  from public.sales s
  join public.sale_items si on si.sale_id = s.id
  join public.menu_items mi on mi.id = si.menu_item_id
  cross join kenya_bounds kb
  where s.sold_at >= kb.day_start_utc
    and s.sold_at < kb.day_end_utc
    and s.status = 'finalized'::public.sale_status
    and s.payment_method in ('cash'::public.payment_method, 'mpesa'::public.payment_method, 'debt'::public.payment_method)
  group by si.menu_item_id, mi.name
)
select 'kenya_bounds' as check_name, to_jsonb(kb) as result from kenya_bounds kb
union all
select 'actual_columns' as check_name, coalesce(jsonb_agg(to_jsonb(cc) order by cc.table_name, cc.column_name), '[]'::jsonb) from column_check cc
union all
select 'today_sales' as check_name, coalesce(jsonb_agg(to_jsonb(ts) order by ts.sold_at), '[]'::jsonb) from today_sales ts
union all
select 'today_sale_items' as check_name, coalesce(jsonb_agg(to_jsonb(tsi) order by tsi.sale_id, tsi.menu_item_id), '[]'::jsonb) from today_sale_items tsi
union all
select 'linked_menu_items' as check_name, coalesce(jsonb_agg(to_jsonb(lmi) order by lmi.menu_item_name), '[]'::jsonb) from linked_menu_items lmi
union all
select 'chef_aggregate' as check_name, coalesce(jsonb_agg(to_jsonb(ca) order by ca.quantity_sold desc, ca.item_name), '[]'::jsonb) from chef_aggregate ca;
