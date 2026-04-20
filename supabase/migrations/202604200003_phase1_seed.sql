-- Phase 1 seed data for baseline environments
insert into public.roles (role, description)
values
  ('owner', 'Business owner with unrestricted access'),
  ('waiter', 'Front-of-house cashier and debt collector'),
  ('chef', 'Kitchen operator for stock and production'),
  ('manager', 'Reserved for later phases'),
  ('cashier', 'Reserved for later phases'),
  ('accountant', 'Reserved for later phases')
on conflict (role) do update set description = excluded.description;

insert into public.ledger_accounts (code, account_type, active)
values
  ('CASH_MAIN', 'cash', true),
  ('MPESA_MAIN', 'mpesa', true),
  ('DEBT_RECEIVABLE', 'debt_receivable', true)
on conflict (code) do nothing;

insert into public.menu_categories (name, active)
values
  ('Breakfast', true),
  ('Main Meals', true),
  ('Drinks', true)
on conflict (name) do nothing;

insert into public.menu_items (name, category_id, selling_price, cost_price, stock_tracked, active, kitchen_item, reorder_level)
select
  data.name,
  c.id,
  data.selling_price,
  data.cost_price,
  data.stock_tracked,
  true,
  data.kitchen_item,
  data.reorder_level
from (
  values
    ('Mandazi + Chai', 'Breakfast', 120.00::numeric, 60.00::numeric, false, true, null::numeric),
    ('Chicken Pilau', 'Main Meals', 550.00::numeric, 300.00::numeric, true, true, 10.00::numeric),
    ('Soda 300ml', 'Drinks', 100.00::numeric, 55.00::numeric, true, false, 24.00::numeric)
) as data(name, category_name, selling_price, cost_price, stock_tracked, kitchen_item, reorder_level)
join public.menu_categories c on c.name = data.category_name
on conflict (name, category_id) do update
set selling_price = excluded.selling_price,
    cost_price = excluded.cost_price,
    stock_tracked = excluded.stock_tracked,
    kitchen_item = excluded.kitchen_item,
    reorder_level = excluded.reorder_level;

insert into public.settings (id, business_name)
values (true, 'Fryva Restaurant')
on conflict (id) do update set business_name = excluded.business_name;
