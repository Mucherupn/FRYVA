import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { requireRole } from '@/lib/auth/guards';

export default async function Page() {
  await requireRole(['owner']);

  return (
    <DashboardShell role="owner" title="Owner inventory" description="Phase 1 scaffold for /owner/inventory.">
      <p className="text-sm text-slate-700">This module is scaffolded and will be implemented in upcoming phases.</p>
    </DashboardShell>
  );
}
