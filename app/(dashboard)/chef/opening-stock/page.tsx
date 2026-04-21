import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { OpeningStockWorkflow } from '@/components/chef/opening-stock-workflow';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function Page() {
  await requireRole(['chef', 'owner']);
  const supabase = await createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: menuItems } = await supabase
    .from('menu_items')
    .select('id, name, menu_categories(name)')
    .eq('active', true)
    .or('kitchen_item.eq.true,stock_tracked.eq.true')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  const { data: recent } = await supabase
    .from('opening_stock_entries')
    .select('id, entry_date, qty, created_at, updated_at, entered_by, menu_items(name), profiles!opening_stock_entries_entered_by_fkey(full_name)')
    .eq('entry_date', today)
    .order('updated_at', { ascending: false })
    .limit(40);

  const items = (menuItems ?? []).map((row: any) => ({ id: row.id, name: row.name, category_name: row.menu_categories?.name ?? 'Uncategorized' }));

  return (
    <DashboardShell role="chef" title="Chef opening stock" description="Bulk enter and revise opening stock per item per day.">
      <OpeningStockWorkflow items={items} defaultDate={today} />
      <section className="mt-6 space-y-2 rounded border p-4">
        <h2 className="font-semibold">Today&apos;s opening stock records</h2>
        {(recent ?? []).map((entry: any) => (
          <article key={entry.id} className="rounded border p-2 text-sm">
            <p className="font-medium">{entry.menu_items?.name ?? 'Item'} · {entry.qty}</p>
            <p className="text-xs text-slate-500">{entry.entry_date} · entered by {entry.profiles?.full_name ?? entry.entered_by} · updated {new Date(entry.updated_at ?? entry.created_at).toLocaleString()}</p>
          </article>
        ))}
      </section>
    </DashboardShell>
  );
}
