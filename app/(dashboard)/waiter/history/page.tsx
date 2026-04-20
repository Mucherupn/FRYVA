import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function money(value: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(value);
}

export default async function Page() {
  const auth = await requireRole(['waiter', 'owner']);
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('sales')
    .select('id, sale_number, sold_by, sold_at, total, payment_method, note')
    .order('sold_at', { ascending: false })
    .limit(50);

  if (auth.activeRole === 'waiter') {
    query = query.eq('sold_by', auth.userId);
  }

  const { data: sales } = await query;
  const waiterIds = Array.from(new Set((sales ?? []).map((sale: any) => sale.sold_by)));
  const { data: waiterProfiles } = waiterIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', waiterIds)
    : { data: [] as Array<{ id: string; full_name: string }> };
  const waiterNameMap = new Map((waiterProfiles ?? []).map((profile) => [profile.id, profile.full_name]));

  return (
    <DashboardShell
      role={auth.activeRole === 'owner' ? 'owner' : 'waiter'}
      title="Sales history"
      description="Recent finalized sales and payment split visibility."
    >
      <div className="space-y-2">
        {(sales ?? []).length === 0 ? (
          <p className="rounded border border-dashed p-4 text-sm text-slate-500">No sales recorded yet.</p>
        ) : (
          (sales ?? []).map((sale: any) => (
            <article key={sale.id} className="rounded border p-3 text-sm">
              <p className="font-semibold">{sale.sale_number} · {money(Number(sale.total))}</p>
              <p className="text-xs text-slate-500">
                {new Date(sale.sold_at).toLocaleString()} · {sale.payment_method} · {waiterNameMap.get(sale.sold_by) ?? 'Unknown waiter'}
              </p>
              {sale.note ? <p className="mt-1 text-xs">Note: {sale.note}</p> : null}
            </article>
          ))
        )}
      </div>
    </DashboardShell>
  );
}
