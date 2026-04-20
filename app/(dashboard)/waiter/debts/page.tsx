import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { DebtsWorkflow } from '@/components/debts/debts-workflow';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function Page() {
  const auth = await requireRole(['waiter', 'owner']);
  const supabase = await createServerSupabaseClient();

  const query = supabase
    .from('debts')
    .select('id, status, original_amount, remaining_amount, created_at, assigned_waiter_id, debtors(full_name, phone)')
    .order('created_at', { ascending: false });

  const { data: debtsData } = auth.activeRole === 'owner' ? await query : await query.eq('assigned_waiter_id', auth.userId);
  const waiterIds = Array.from(new Set((debtsData ?? []).map((debt: any) => debt.assigned_waiter_id)));
  const { data: profiles } = waiterIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', waiterIds)
    : { data: [] as Array<{ id: string; full_name: string }> };
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));

  const debts = (debtsData ?? []).map((debt: any) => ({
    id: debt.id,
    status: debt.status,
    original_amount: Number(debt.original_amount),
    remaining_amount: Number(debt.remaining_amount),
    created_at: debt.created_at,
    assigned_waiter_name: profileMap.get(debt.assigned_waiter_id) ?? 'Unknown waiter',
    debtor_name: debt.debtors?.full_name ?? 'Unknown debtor',
    debtor_phone: debt.debtors?.phone ?? null,
  }));

  return (
    <DashboardShell
      role={auth.activeRole === 'owner' ? 'owner' : 'waiter'}
      title="Debt Collections"
      description="Track debt balances and record cash/mpesa collections with payment history."
    >
      <DebtsWorkflow debts={debts} ownerMode={auth.activeRole === 'owner'} />
    </DashboardShell>
  );
}
