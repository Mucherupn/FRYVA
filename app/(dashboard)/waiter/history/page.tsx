import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { requireRole } from '@/lib/auth/guards';

export default async function Page() {
  await requireRole(['waiter', 'owner']);

  return (
    <DashboardShell role="waiter" title="Waiter history" description="Phase 1 scaffold for /waiter/history.">
      <p className="text-sm text-slate-700">This module is scaffolded and will be implemented in upcoming phases.</p>
    </DashboardShell>
  );
}
