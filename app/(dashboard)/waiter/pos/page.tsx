import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { PosWorkflow } from '@/components/pos/pos-workflow';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function Page() {
  const auth = await requireRole(['waiter', 'owner']);
  const supabase = await createServerSupabaseClient();

  const { data: menuItems } = await supabase
    .from('menu_items')
    .select('id, name, selling_price, menu_categories(name)')
    .eq('active', true)
    .order('name', { ascending: true });

  const mappedItems = (menuItems ?? []).map((item: any) => ({
    id: item.id,
    name: item.name,
    selling_price: Number(item.selling_price),
    category_name: item.menu_categories?.name ?? 'Uncategorized',
  }));

  return (
    <DashboardShell
      role={auth.activeRole === 'owner' ? 'owner' : 'waiter'}
      title="POS Sales"
      description="Create cash, mpesa, and debt sales quickly from active menu items."
    >
      <PosWorkflow menuItems={mappedItems} />
    </DashboardShell>
  );
}
