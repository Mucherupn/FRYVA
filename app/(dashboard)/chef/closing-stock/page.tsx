import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { ClosingStockWorkflow } from '@/components/chef/closing-stock-workflow';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { formatKenyaDateTime, kenyaTodayDate } from '@/lib/time/kenya';
export default async function Page() {
  await requireRole(['chef', 'owner']); const supabase = await createServerSupabaseClient(); const today = kenyaTodayDate();
  const [{ data: menuItems }, { data: recent }] = await Promise.all([
    supabase.from('menu_items').select('id, name, menu_categories(name)').eq('active', true).eq('stock_tracked', true).order('sort_order', { ascending: true }).order('name', { ascending: true }),
    supabase.from('closing_stock_entries').select('id, entry_date, qty, updated_at, created_at, entered_by, menu_items(name), profiles!closing_stock_entries_entered_by_fkey(full_name)').eq('entry_date', today).order('updated_at', { ascending: false }).limit(60),
  ]);
  const qtyMap = new Map((recent ?? []).map((r: any) => [r.menu_items?.name, Number(r.qty)]));
  const items = (menuItems ?? []).map((row: any) => ({ id: row.id, name: row.name, category_name: row.menu_categories?.name ?? 'Uncategorized', default_qty: qtyMap.get(row.name) }));
  return <DashboardShell role="chef" title="Chef closing stock" description="Record actual end-of-day stock for variance checks and tomorrow opening defaults."><ClosingStockWorkflow items={items} defaultDate={today} /><section className="panel"><h2 className="section-title">Today’s closing stock records</h2>{(recent ?? []).map((entry: any) => <article key={entry.id} className="row-card" style={{ marginTop: 8 }}><p style={{ margin: 0, fontWeight: 650 }}>{entry.menu_items?.name ?? 'Item'} · {entry.qty}</p><p className="section-subtitle">{entry.entry_date} · entered by {entry.profiles?.full_name ?? entry.entered_by} · updated {formatKenyaDateTime(entry.updated_at ?? entry.created_at)}</p></article>)}</section></DashboardShell>;
}
