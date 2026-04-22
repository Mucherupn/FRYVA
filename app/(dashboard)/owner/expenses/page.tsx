import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { OwnerExpensesWorkflow } from '@/components/owner/owner-expenses-workflow';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type Search = { date_from?: string; date_to?: string; category?: string; source?: string; page?: string };

function money(value: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(value);
}

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole(['owner']);
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const page = Math.max(1, Number((params as any)?.page ?? '1') || 1);
  const pageSize = 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const today = new Date().toISOString().slice(0, 10);

  let query = supabase.from('expenses').select('id, expense_time, description, category, amount, payment_method, source, note', { count: 'exact' }).order('expense_time', { ascending: false }).range(from, to);
  if (params.date_from) query = query.gte('expense_time', `${params.date_from}T00:00:00`);
  if (params.date_to) query = query.lte('expense_time', `${params.date_to}T23:59:59`);
  if (params.category) query = query.eq('category', params.category);
  if (params.source) query = query.eq('source', params.source);

  const [{ data: expenses, count }, { data: categories }] = await Promise.all([
    query,
    supabase.from('expenses').select('category').not('category', 'is', null),
  ]);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  const uniqueCategories = Array.from(new Set((categories ?? []).map((row) => row.category).filter(Boolean)));

  return (
    <DashboardShell role="owner" title="Owner expenses" description="Capture business expenses and monitor chef vs owner spending.">
      <OwnerExpensesWorkflow defaultDate={today} />
      <form className="filter-bar mt-6 md:grid-cols-5">
        <input name="date_from" defaultValue={params.date_from} type="date" className="rounded border px-2 py-1 text-sm" />
        <input name="date_to" defaultValue={params.date_to} type="date" className="rounded border px-2 py-1 text-sm" />
        <select name="category" defaultValue={params.category ?? ''} className="rounded border px-2 py-1 text-sm"><option value="">All categories</option>{uniqueCategories.map((category) => <option key={category} value={category ?? ''}>{category}</option>)}</select>
        <select name="source" defaultValue={params.source ?? ''} className="rounded border px-2 py-1 text-sm"><option value="">All sources</option><option value="owner">Owner</option><option value="chef">Chef</option></select>
        <button type="submit" className="rounded bg-black px-3 py-2 text-sm text-white">Apply filters</button>
      </form>
      <div className="mt-3 mb-2 flex items-center justify-between text-xs text-slate-600"><p>Page {page} of {totalPages}</p><div className="space-x-2">{page > 1 ? <a className="underline" href={`?page=${page - 1}`}>Previous</a> : null}{page < totalPages ? <a className="underline" href={`?page=${page + 1}`}>Next</a> : null}</div></div>
      <section className="mt-3 space-y-2">
        {(expenses ?? []).map((expense) => (
          <article key={expense.id} className="rounded border p-3 text-sm">
            <p className="font-semibold">{expense.description} · {money(Number(expense.amount))}</p>
            <p className="text-xs text-slate-500">{new Date(expense.expense_time).toLocaleString()} · {expense.payment_method} · source: {expense.source}{expense.category ? ` · ${expense.category}` : ''}</p>
          </article>
        ))}
      </section>
    </DashboardShell>
  );
}
