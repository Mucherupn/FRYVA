import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { requireRole } from '@/lib/auth/guards';

export default async function OwnerDashboardPage() {
  await requireRole(['owner']);

  return (
    <DashboardShell
      role="owner"
      title="Owner Dashboard"
      description="High-level KPIs and system controls will be added in the next phases."
    >
      <p className="text-sm text-slate-700">
        Phase 1 shell is ready. Use the Users page to assign or update role access.
      </p>
    </DashboardShell>
  );
}
