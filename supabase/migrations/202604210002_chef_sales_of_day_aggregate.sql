-- Chef dashboard sales-of-day aggregate.
-- Exposes only menu item names and quantities sold during the current Kenya day.

create or replace function public.get_chef_sales_of_day()
returns table (
  item_name text,
  quantity_sold numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with kenya_bounds as (
    select
      ((now() at time zone 'Africa/Nairobi')::date at time zone 'Africa/Nairobi') as day_start,
      (((now() at time zone 'Africa/Nairobi')::date + 1) at time zone 'Africa/Nairobi') as day_end
  )
  select
    mi.name as item_name,
    sum(si.quantity)::numeric as quantity_sold
  from public.sales s
  join public.sale_items si on si.sale_id = s.id
  join public.menu_items mi on mi.id = si.menu_item_id
  cross join kenya_bounds kb
  where (public.current_user_has_role('chef') or public.current_user_has_role('owner'))
    and s.sold_at >= kb.day_start
    and s.sold_at < kb.day_end
    and s.status = 'finalized'
    and s.payment_method in ('cash', 'mpesa', 'debt')
  group by si.menu_item_id, mi.name
  having sum(si.quantity) > 0
  order by sum(si.quantity) desc, mi.name asc;
$$;

revoke all on function public.get_chef_sales_of_day() from public;
grant execute on function public.get_chef_sales_of_day() to authenticated;
