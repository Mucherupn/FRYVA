import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { MetricCard } from '@/components/ui/fryva-ui';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function money(value: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(value);
}

export default async function WaiterDashboardPage() {
  const auth = await requireRole(['waiter', 'owner']);
  const supabase = await createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  let todaySalesQuery = supabase.from('sales').select('total, payment_method').gte('sold_at', `${today}T00:00:00`).lte('sold_at', `${today}T23:59:59`);
  if (auth.activeRole === 'waiter') todaySalesQuery = todaySalesQuery.eq('sold_by', auth.userId);

  const { data: todaySales } = await todaySalesQuery;

  const totals = { all: 0, cash: 0, mpesa: 0, debt: 0 };
  for (const sale of todaySales ?? []) {
    const value = Number((sale as any).total);
    totals.all += value;
    if ((sale as any).payment_method === 'cash') totals.cash += value;
    if ((sale as any).payment_method === 'mpesa') totals.mpesa += value;
    if ((sale as any).payment_method === 'debt') totals.debt += value;
  }

  return (
    <DashboardShell role={auth.activeRole === 'owner' ? 'owner' : 'waiter'} title="Waiter dashboard" description="Fast shift view with direct access to POS and debt collection.">
      <section className="kpi-grid">
        <MetricCard label="Today total" value={money(totals.all)} />
        <MetricCard label="Cash" value={money(totals.cash)} />
        <MetricCard label="Mpesa" value={money(totals.mpesa)} />
        <MetricCard label="Debt" value={money(totals.debt)} />
      </section>
      <section className="panel">
        <div className="form-grid">
          <div className="form-col-4">
        <Link href="/waiter/pos" className="btn btn-primary" style={{ width: "100%" }}>Open POS</Link>
          </div>
          <div className="form-col-4"><Link href="/waiter/debts" className="btn btn-secondary" style={{ width: "100%" }}>Debt collections</Link></div>
          <div className="form-col-4"><Link href="/waiter/history" className="btn btn-secondary" style={{ width: "100%" }}>Sales history</Link></div>
        </div>
      </section>
    </DashboardShell>
  );
}
