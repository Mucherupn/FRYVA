import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { EmptyState } from '@/components/ui/fryva-ui';
import { DebtReminderModal } from '@/components/debts/debt-reminder-modal';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { kenyaTodayDate } from '@/lib/time/kenya';

function money(value: number) { return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(value); }

export default async function WaiterDashboardPage() {
  const auth = await requireRole(['waiter', 'owner']);
  const supabase = await createServerSupabaseClient();
  const today = kenyaTodayDate();

  let query = supabase.from('debts').select('id, remaining_amount, created_at, status, debtors(full_name, phone, notes)').neq('status', 'paid').order('created_at', { ascending: true });
  if (auth.activeRole === 'waiter') query = query.eq('assigned_waiter_id', auth.userId);
  const { data } = await query;
  const debts = (data ?? []).map((debt: any) => ({ id: debt.id, debtor_name: debt.debtors?.full_name ?? 'Unknown debtor', debtor_phone: debt.debtors?.phone ?? null, note: debt.debtors?.notes ?? null, remaining_amount: Number(debt.remaining_amount), created_at: debt.created_at }));

  return (
    <DashboardShell role={auth.activeRole === 'owner' ? 'owner' : 'waiter'} title="Waiter dashboard" description="Debt follow-up and fast access to service tools. Sales totals are owner-only.">
      {auth.activeRole === 'waiter' ? <DebtReminderModal debts={debts} userId={auth.userId} today={today} /> : null}
      <section className="panel">
        <h2 className="section-title">Quick actions</h2>
        <div className="form-grid">
          <div className="form-col-6"><Link href="/waiter/pos" className="btn btn-primary" style={{ width: '100%', minHeight: 52 }}>Open POS</Link></div>
          <div className="form-col-6"><Link href="/waiter/debts" className="btn btn-secondary" style={{ width: '100%', minHeight: 52 }}>Debt collections</Link></div>
        </div>
      </section>
      <section className="panel">
        <h2 className="section-title">Debt collection reminders for today</h2>
        <p className="section-subtitle">Follow up outstanding assigned debts before closing. No revenue totals are shown here.</p>
        {debts.length === 0 ? <EmptyState title="No outstanding debts" description="There are no debt follow-ups assigned right now." /> : <div className="list-stack" style={{ marginTop: 12 }}>{debts.map((debt) => <article key={debt.id} className="row-card"><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><div><strong>{debt.debtor_name}</strong><p className="section-subtitle">{debt.debtor_phone ?? 'No phone'} · original date {new Date(debt.created_at).toLocaleDateString('en-KE')}</p>{debt.note ? <p className="section-subtitle">{debt.note}</p> : null}</div><strong>{money(debt.remaining_amount)}</strong></div></article>)}</div>}
      </section>
    </DashboardShell>
  );
}
