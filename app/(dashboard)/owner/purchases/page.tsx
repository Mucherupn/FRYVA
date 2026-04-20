import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { PurchasesWorkflow } from '@/components/owner/purchases-workflow';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type Search = { date_from?: string; date_to?: string; category?: string };

function money(value: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(value);
}

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole(['owner']);
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  let query = supabase.from('purchases').select('id, purchase_date, item_name, menu_item_id, category, qty, unit, total_cost, payment_method, supplier, note').order('purchase_date', { ascending: false }).limit(120);
  if (params.date_from) query = query.gte('purchase_date', params.date_from);
  if (params.date_to) query = query.lte('purchase_date', params.date_to);
  if (params.category) query = query.eq('category', params.category);

  const [{ data: purchases }, { data: categories }, { data: menuItems }] = await Promise.all([
    query,
    supabase.from('purchases').select('category').not('category', 'is', null),
    supabase.from('menu_items').select('id, name, menu_categories(name)').eq('active', true).order('name', { ascending: true }),
  ]);

  const uniqueCategories = Array.from(new Set((categories ?? []).map((row) => row.category).filter(Boolean)));

  return (
    <DashboardShell role="owner" title="Owner purchases" description="Record daily purchases and track outflows by category/date.">
      <PurchasesWorkflow
        defaultDate={today}
        menuItems={(menuItems ?? []).map((item: any) => ({ id: item.id, name: item.name, category: item.menu_categories?.name ?? null }))}
      />
      <form className="mt-6 grid gap-2 rounded border p-3 md:grid-cols-4">
        <input name="date_from" defaultValue={params.date_from} type="date" className="rounded border px-2 py-1 text-sm" />
        <input name="date_to" defaultValue={params.date_to} type="date" className="rounded border px-2 py-1 text-sm" />
        <select name="category" defaultValue={params.category ?? ''} className="rounded border px-2 py-1 text-sm"><option value="">All categories</option>{uniqueCategories.map((category) => <option key={category} value={category ?? ''}>{category}</option>)}</select>
        <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">Apply filters</button>
      </form>
      <section className="mt-3 space-y-2">
        {(purchases ?? []).map((purchase: any) => (
          <article key={purchase.id} className="rounded border p-3 text-sm">
            <p className="font-semibold">{purchase.item_name} · {purchase.qty} {purchase.unit} · {money(Number(purchase.total_cost))}</p>
            <p className="text-xs text-slate-500">{purchase.purchase_date} · {purchase.payment_method}{purchase.category ? ` · ${purchase.category}` : ''}{purchase.supplier ? ` · ${purchase.supplier}` : ''}{purchase.menu_item_id ? ' · linked item' : ' · unlinked item'}</p>
          </article>
        ))}
      </section>
    </DashboardShell>
  );
}
