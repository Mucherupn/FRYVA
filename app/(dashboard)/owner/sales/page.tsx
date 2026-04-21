import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type Search = {
  date_from?: string;
  date_to?: string;
  waiter?: string;
  payment_method?: 'cash' | 'mpesa' | 'debt';
  sale_id?: string;
  status?: 'finalized' | 'voided';
  page?: string;
};

function money(value: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(value);
}

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole(['owner']);
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const page = Math.max(1, Number(params.page ?? '1') || 1);
  const pageSize = 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: waiters } = await supabase.from('user_role_assignments').select('user_id').eq('role', 'waiter');
  const waiterIds = Array.from(new Set((waiters ?? []).map((waiter) => waiter.user_id)));
  const { data: waiterProfiles } = waiterIds.length ? await supabase.from('profiles').select('id, full_name').in('id', waiterIds) : { data: [] as Array<{ id: string; full_name: string }> };
  const waiterNameMap = new Map((waiterProfiles ?? []).map((profile) => [profile.id, profile.full_name]));

  let salesQuery = supabase
    .from('sales')
    .select('id, sale_number, sold_by, sold_at, total, payment_method, note, status', { count: 'exact' })
    .order('sold_at', { ascending: false })
    .range(from, to);

  if (params.waiter) salesQuery = salesQuery.eq('sold_by', params.waiter);
  if (params.payment_method) salesQuery = salesQuery.eq('payment_method', params.payment_method);
  if (params.status) salesQuery = salesQuery.eq('status', params.status);
  if (params.date_from) salesQuery = salesQuery.gte('sold_at', `${params.date_from}T00:00:00`);
  if (params.date_to) salesQuery = salesQuery.lte('sold_at', `${params.date_to}T23:59:59`);

  const { data: sales, count } = await salesQuery;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  let selectedSale: any = null;
  let saleItems: any[] = [];
  if (params.sale_id) {
    const { data } = await supabase.from('sales').select('id, sale_number, sold_by, sold_at, subtotal, total, payment_method, note, status').eq('id', params.sale_id).maybeSingle();
    selectedSale = data;

    const { data: items } = await supabase.from('sale_items').select('id, quantity, unit_price, line_total, menu_item_name').eq('sale_id', params.sale_id).order('id', { ascending: true });
    saleItems = items ?? [];
  }

  const q = new URLSearchParams();
  if (params.date_from) q.set('date_from', params.date_from);
  if (params.date_to) q.set('date_to', params.date_to);
  if (params.waiter) q.set('waiter', params.waiter);
  if (params.payment_method) q.set('payment_method', params.payment_method);
  if (params.status) q.set('status', params.status);

  return (
    <DashboardShell role="owner" title="Owner sales" description="Review sales with server-side pagination, filtering, and printable detail.">
      <form className="mb-4 grid gap-2 rounded border p-3 md:grid-cols-6">
        <input name="date_from" defaultValue={params.date_from} type="date" className="rounded border px-2 py-1 text-sm" />
        <input name="date_to" defaultValue={params.date_to} type="date" className="rounded border px-2 py-1 text-sm" />
        <select name="waiter" defaultValue={params.waiter ?? ''} className="rounded border px-2 py-1 text-sm"><option value="">All waiters</option>{(waiters ?? []).map((w: any) => <option key={w.user_id} value={w.user_id}>{waiterNameMap.get(w.user_id) ?? w.user_id}</option>)}</select>
        <select name="payment_method" defaultValue={params.payment_method ?? ''} className="rounded border px-2 py-1 text-sm"><option value="">All methods</option><option value="cash">Cash</option><option value="mpesa">Mpesa</option><option value="debt">Debt</option></select>
        <select name="status" defaultValue={params.status ?? ''} className="rounded border px-2 py-1 text-sm"><option value="">All statuses</option><option value="finalized">Finalized</option><option value="voided">Voided</option></select>
        <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">Apply filters</button>
      </form>

      <div className="mb-3 flex items-center justify-between text-xs text-slate-600">
        <p>Page {page} of {totalPages} · {(count ?? 0)} sales</p>
        <div className="space-x-2">
          {page > 1 ? <Link className="underline" href={`/owner/sales?${new URLSearchParams({ ...Object.fromEntries(q.entries()), page: String(page - 1) }).toString()}`}>Previous</Link> : null}
          {page < totalPages ? <Link className="underline" href={`/owner/sales?${new URLSearchParams({ ...Object.fromEntries(q.entries()), page: String(page + 1) }).toString()}`}>Next</Link> : null}
        </div>
      </div>

      <div className="space-y-2">
        {(sales ?? []).length === 0 ? <p className="rounded border border-dashed p-4 text-sm text-slate-500">No sales found for selected filters.</p> : (sales ?? []).map((sale: any) => (
          <Link key={sale.id} href={`/owner/sales?${new URLSearchParams({ ...Object.fromEntries(q.entries()), sale_id: sale.id, page: String(page) }).toString()}`} className="block rounded border p-3 text-sm hover:border-black">
            <p className="font-semibold">{sale.sale_number} · {money(Number(sale.total))}</p>
            <p className="text-xs text-slate-500">{new Date(sale.sold_at).toLocaleString()} · {sale.payment_method} · {sale.status} · {waiterNameMap.get(sale.sold_by) ?? 'Unknown waiter'}</p>
          </Link>
        ))}
      </div>

      {selectedSale ? (
        <section className="mt-6 space-y-2 rounded-lg border p-4 print:border-none">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Sale detail: {selectedSale.sale_number}</h2>
            <span className="text-xs text-slate-500">Use browser print on this page for a clean receipt-style detail.</span>
          </div>
          <p className="text-sm text-slate-600">{new Date(selectedSale.sold_at).toLocaleString()} · {selectedSale.payment_method} · {selectedSale.status} · Waiter: {waiterNameMap.get(selectedSale.sold_by) ?? 'Unknown'}</p>
          {selectedSale.note ? <p className="text-sm">Note: {selectedSale.note}</p> : null}
          <div className="space-y-1 text-sm">{saleItems.map((item: any) => <p key={item.id} className="flex justify-between rounded border px-2 py-1"><span>{item.menu_item_name ?? 'Item'} × {item.quantity}</span><span>{money(Number(item.line_total))}</span></p>)}</div>
          <p className="text-sm font-semibold">Total: {money(Number(selectedSale.total))}</p>
        </section>
      ) : null}
    </DashboardShell>
  );
}
