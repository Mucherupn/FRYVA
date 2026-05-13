-- Surgical fix for chef dashboard Sales of the Day aggregate.
-- The chef page must not read sales/sale_items directly; this RPC exposes only
-- today's menu item quantities for chef/owner callers.

create or replace function public.get_chef_sales_of_day()
returns table (
  item_name text,
  quantity_sold numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_kenya_day date := (now() at time zone 'Africa/Nairobi')::date;
  v_day_start timestamptz := v_kenya_day::timestamp at time zone 'Africa/Nairobi';
  v_day_end timestamptz := (v_kenya_day + 1)::timestamp at time zone 'Africa/Nairobi';
begin
  if v_actor_id is null then
    raise exception 'Authentication required';
  end if;

  if not (
    public.user_has_role(v_actor_id, 'chef'::public.app_role)
    or public.user_has_role(v_actor_id, 'owner'::public.app_role)
  ) then
    raise exception 'Only chef/owner can view sales of the day';
  end if;

  return query
  select
    mi.name::text as item_name,
    sum(si.quantity)::numeric as quantity_sold
  from public.sales s
  join public.sale_items si on si.sale_id = s.id
  join public.menu_items mi on mi.id = si.menu_item_id
  where s.sold_at >= v_day_start
    and s.sold_at < v_day_end
    and s.status = 'finalized'::public.sale_status
    and s.payment_method in ('cash'::public.payment_method, 'mpesa'::public.payment_method, 'debt'::public.payment_method)
  group by si.menu_item_id, mi.name
  having sum(si.quantity) > 0
  order by sum(si.quantity) desc, mi.name asc;
end;
$$;

revoke all on function public.get_chef_sales_of_day() from public;
grant execute on function public.get_chef_sales_of_day() to authenticated;
