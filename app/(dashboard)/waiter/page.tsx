import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { requireRole } from '@/lib/auth/guards';

export default async function WaiterDashboardPage() {
  await requireRole(['waiter', 'owner']);

  return (
    <DashboardShell
      role="waiter"
      title="Waiter Dashboard"
      description="POS launch and debt follow-up modules are scaffolded for Phase 2."
    >
      <ul className="list-disc space-y-2 pl-6 text-sm text-slate-700">
        <li>Quick actions for POS and debt collections will plug in next.</li>
        <li>History and today summary cards will appear once workflow RPCs are live.</li>
      </ul>
    </DashboardShell>
  );
}
