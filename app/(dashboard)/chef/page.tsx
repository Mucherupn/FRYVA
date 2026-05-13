import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ChefSoldItemRow = {
  item_name: string;
  quantity_sold: number | string;
};

export default async function ChefDashboardPage() {
  await requireRole(['chef', 'owner']);
  const supabase = await createServerSupabaseClient();
  const { data: soldRowsData, error: soldRowsError } = await supabase.rpc('get_chef_sales_of_day');

  if (soldRowsError) {
    console.error('Chef sales of day RPC failed', soldRowsError.message);
  }

  const soldRows = ((soldRowsData ?? []) as ChefSoldItemRow[]).map((row) => ({
    name: row.item_name,
    quantity: Number(row.quantity_sold),
  }));

  return (
    <DashboardShell role="chef" title="Chef dashboard" description="Practical kitchen controls for stock, production, and expense capture.">
      <section className="panel">
        <h2 className="section-title">Kitchen workflows</h2>
        <div className="form-grid">
          <Link href="/chef/opening-stock" className="row-card form-col-4"><strong>Opening stock</strong><p className="section-subtitle">Bulk morning entry with revision-safe updates.</p></Link>
          <Link href="/chef/production" className="row-card form-col-4"><strong>Production</strong><p className="section-subtitle">Fast prepared output logging throughout the shift.</p></Link>
          <Link href="/chef/expenses" className="row-card form-col-4"><strong>Kitchen expenses</strong><p className="section-subtitle">Capture kitchen spend linked to cash and Mpesa ledgers.</p></Link>
        </div>
      </section>

      <section className="panel">
        <div className="mb-3">
          <h2 className="section-title">Sales of the Day</h2>
          <p className="section-subtitle">Menu item quantities sold today across cash, Mpesa, and debt sales.</p>
        </div>
        {soldRows.length === 0 ? (
          <p className="rounded border border-dashed p-4 text-sm text-slate-500">No sales recorded today.</p>
        ) : (
          <div className="divide-y rounded border">
            {soldRows.map((row) => (
              <div key={row.name} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">{row.name}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-900">{row.quantity}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
