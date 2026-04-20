import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { ProductionWorkflow } from '@/components/chef/production-workflow';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function Page() {
  await requireRole(['chef', 'owner']);
  const supabase = await createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: menuItems } = await supabase
    .from('menu_items')
    .select('id, name')
    .eq('active', true)
    .or('kitchen_item.eq.true,stock_tracked.eq.true')
    .order('name', { ascending: true });

  const { data: entries } = await supabase
    .from('stock_production_entries')
    .select('id, entry_date, qty, note, produced_at, menu_items(name), profiles!stock_production_entries_entered_by_fkey(full_name)')
    .eq('entry_date', today)
    .order('produced_at', { ascending: false })
    .limit(80);

  return (
    <DashboardShell role="chef" title="Chef production" description="Record prepared/cooked quantities throughout the day.">
      <ProductionWorkflow items={(menuItems ?? []) as Array<{ id: number; name: string }>} defaultDate={today} />
      <section className="mt-6 space-y-2 rounded border p-4">
        <h2 className="font-semibold">Today&apos;s production entries</h2>
        {(entries ?? []).map((entry: any) => (
          <article key={entry.id} className="rounded border p-2 text-sm">
            <p className="font-medium">{entry.menu_items?.name ?? 'Item'} · {entry.qty}</p>
            <p className="text-xs text-slate-500">{new Date(entry.produced_at).toLocaleString()} · by {entry.profiles?.full_name ?? 'Unknown'}{entry.note ? ` · ${entry.note}` : ''}</p>
          </article>
        ))}
      </section>
    </DashboardShell>
  );
}
