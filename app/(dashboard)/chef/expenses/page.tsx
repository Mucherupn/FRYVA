import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { ChefExpensesWorkflow } from '@/components/chef/chef-expenses-workflow';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function money(value: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(value);
}

export default async function Page() {
  await requireRole(['chef', 'owner']);
  const supabase = await createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: expenses } = await supabase
    .from('expenses')
    .select('id, expense_time, description, category, amount, payment_method, source, note')
    .eq('source', 'chef')
    .order('expense_time', { ascending: false })
    .limit(80);

  return (
    <DashboardShell role="chef" title="Chef expenses" description="Fast kitchen expense capture with server-side ledger enforcement.">
      <ChefExpensesWorkflow defaultDate={today} />
      <section className="mt-6 space-y-2 rounded border p-4">
        <h2 className="font-semibold">Recent kitchen expenses</h2>
        {(expenses ?? []).map((entry) => (
          <article key={entry.id} className="rounded border p-2 text-sm">
            <p className="font-medium">{entry.description} · {money(Number(entry.amount))}</p>
            <p className="text-xs text-slate-500">{new Date(entry.expense_time).toLocaleString()} · {entry.payment_method}{entry.category ? ` · ${entry.category}` : ''}{entry.note ? ` · ${entry.note}` : ''}</p>
          </article>
        ))}
      </section>
    </DashboardShell>
  );
}
