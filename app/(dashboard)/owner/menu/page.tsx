import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { MenuManagementWorkflow } from '@/components/owner/menu-management-workflow';
import { requireRole } from '@/lib/auth/guards';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type Search = {
  q?: string;
  status?: 'active' | 'inactive';
  availability?: 'available' | 'unavailable';
  category?: string;
};

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole(['owner']);
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('menu_items')
    .select('id, name, selling_price, active, available, stock_tracked, item_type, sort_order, menu_categories(name)')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (params.q?.trim()) query = query.ilike('name', `%${params.q.trim()}%`);
  if (params.status === 'active') query = query.eq('active', true);
  if (params.status === 'inactive') query = query.eq('active', false);
  if (params.availability === 'available') query = query.eq('available', true);
  if (params.availability === 'unavailable') query = query.eq('available', false);
  if (params.category?.trim()) query = query.eq('menu_categories.name', params.category.trim());

  const [{ data: items }, { data: categories }] = await Promise.all([
    query,
    supabase.from('menu_categories').select('name').order('name', { ascending: true }),
  ]);

  const mappedItems = (items ?? []).map((item: any) => ({
    id: item.id,
    name: item.name,
    selling_price: Number(item.selling_price),
    category_name: item.menu_categories?.name ?? null,
    active: item.active,
    available: item.available,
    stock_tracked: item.stock_tracked,
    item_type: item.item_type ?? (item.kitchen_item ? 'kitchen_prepared' : 'resale'),
    sort_order: item.sort_order ?? 0,
  }));

  return (
    <DashboardShell role="owner" title="Menu management" description="Owner-controlled menu setup for POS, kitchen and reporting.">
      <form className="panel" style={{ marginBottom: 12 }}>
        <h2 className="section-title">Search & filter</h2>
        <div className="form-grid">
          <div className="form-col-4"><input className="input" name="q" placeholder="Search name" defaultValue={params.q} /></div>
          <div className="form-col-2"><select className="select" name="status" defaultValue={params.status ?? ''}><option value="">All status</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
          <div className="form-col-2"><select className="select" name="availability" defaultValue={params.availability ?? ''}><option value="">All availability</option><option value="available">Available</option><option value="unavailable">Unavailable</option></select></div>
          <div className="form-col-2"><select className="select" name="category" defaultValue={params.category ?? ''}><option value="">All categories</option>{(categories ?? []).map((category) => <option key={category.name} value={category.name}>{category.name}</option>)}</select></div>
          <div className="form-col-2"><button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Apply</button></div>
        </div>
      </form>

      <MenuManagementWorkflow items={mappedItems} />
    </DashboardShell>
  );
}
