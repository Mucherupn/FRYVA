import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { requireRole } from '@/lib/auth/guards';

export default async function Page() {
  await requireRole(['chef', 'owner']);

  return (
    <DashboardShell role="chef" title="Chef expenses" description="Phase 1 scaffold for /chef/expenses.">
      <p className="text-sm text-slate-700">This module is scaffolded and will be implemented in upcoming phases.</p>
    </DashboardShell>
  );
}
