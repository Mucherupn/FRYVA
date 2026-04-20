import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function money(value: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(value);
}

export default async function WaiterDashboardPage() {
  const auth = await requireRole(['waiter', 'owner']);
  const supabase = await createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  let todaySalesQuery = supabase
    .from('sales')
    .select('total, payment_method')
    .gte('sold_at', `${today}T00:00:00`)
    .lte('sold_at', `${today}T23:59:59`);

  if (auth.activeRole === 'waiter') {
    todaySalesQuery = todaySalesQuery.eq('sold_by', auth.userId);
  }

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
    <DashboardShell
      role={auth.activeRole === 'owner' ? 'owner' : 'waiter'}
      title="Waiter Dashboard"
      description="Today summary for sales with quick access to POS and debt collection."
    >
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <div className="rounded border p-3"><p className="text-xs text-slate-500">Today total</p><p className="text-lg font-semibold">{money(totals.all)}</p></div>
        <div className="rounded border p-3"><p className="text-xs text-slate-500">Cash</p><p className="text-lg font-semibold">{money(totals.cash)}</p></div>
        <div className="rounded border p-3"><p className="text-xs text-slate-500">Mpesa</p><p className="text-lg font-semibold">{money(totals.mpesa)}</p></div>
        <div className="rounded border p-3"><p className="text-xs text-slate-500">Debt</p><p className="text-lg font-semibold">{money(totals.debt)}</p></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/waiter/pos" className="rounded bg-black px-4 py-2 text-sm text-white">Open POS</Link>
        <Link href="/waiter/debts" className="rounded border px-4 py-2 text-sm">Debt collections</Link>
        <Link href="/waiter/history" className="rounded border px-4 py-2 text-sm">Sales history</Link>
      </div>
    </DashboardShell>
  );
}
